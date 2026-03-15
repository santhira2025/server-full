import asyncio
import httpx
from .request_mutator import RequestMutator
from .response_validator import ResponseValidator
from .context_manager import ContextManager
from .wordlist_resolver import WordListResolver
from .graph.graph import Graph, Node, NodeType
from .graph.graph_executor_factory import GraphExecutorFactory
from .baseline_capture import BaselineCapturer
from server.modules.identity.auth_rotator import AuthRotator

class ExecutionEngine:
    """
    Orchestrates the parallel execution of mutated requests with context handling.
    """
    def __init__(self, concurrency: int = 10, test_id: str | None = None):
        self.mutator = RequestMutator()
        self.validator = ResponseValidator()
        self.baseliner = BaselineCapturer()
        self.auth_rotator = AuthRotator()
        self.limit = asyncio.Semaphore(concurrency)
        self.test_id = test_id or "test-run"

    async def execute_test(self, endpoint: dict, template: dict) -> dict:
        """
        Runs a specific test template against a target endpoint using graph-based orchestration.
        """
        context_manager = ContextManager()
        execute_cfg = template.get('execute', {})
        requests = execute_cfg.get('requests', [])

        if not requests:
            return {"error": "No requests defined in template"}

        # 0. Resolve wordLists and populate ContextManager so ${variable}
        #    substitution works when RequestMutator processes req[] rules.
        wordlists_cfg = template.get('wordLists', {})
        if wordlists_cfg:
            resolver = WordListResolver()
            resolved_wordlists = await resolver.resolve(wordlists_cfg)
            # Store each resolved list in context; substitute_recursive() will
            # replace ${var} with the first value; expand_mutations() handles
            # the multi-value case for execute.type=multiple templates.
            for var_name, values in resolved_wordlists.items():
                context_manager.store[var_name] = values[0] if values else ""

        # 1. Capture baseline to reduce false positives in comparative validation
        baseline = await self.baseliner.capture(endpoint)
        context_manager.store['baseline'] = baseline

        # 2. Build the execution graph
        graph = self._build_graph(requests)

        # 3. Get the appropriate executor based on template execute.type
        # Akto templates use 'single' (most common) or 'multiple' (wordlist expansion).
        execute_type = execute_cfg.get('type', 'single')
        executor = GraphExecutorFactory.get_executor(execute_type, context_manager)
        
        final_results = []
        
        async def run_node_step(node: Node, resolved_data: dict, current_context: dict):
            # This callback is executed by the graph executor for each node.
            # IMPORTANT: Each rule in 'req' generates a SEPARATE HTTP request.
            # This is how Akto implements Command Injection / Input Validation tests
            # with multiple payloads in a single step.
            async with self.limit:
                req_rules = resolved_data.get('req', [{}])
                if not req_rules:
                    req_rules = [{}]

                auth_cfg = template.get('auth', {})
                allow_state_change = execute_cfg.get('allow_state_change', False)
                is_validation_node = (
                    node.data.get('validation_node', False)
                    or (node.id == list(graph.nodes.keys())[-1])
                )
                last_response_data = None

                async with httpx.AsyncClient(timeout=10.0, verify=True) as client:
                    for rule_idx, current_rule in enumerate(req_rules):
                        # Substitute ${var} placeholders before mutation
                        current_rule = context_manager.substitute_recursive(current_rule)
                        mutated_req = self.mutator.mutate(endpoint, current_rule)
                        method = (mutated_req.get("method") or "").upper()
                        if method in {"DELETE", "PUT", "PATCH"} and not allow_state_change:
                            final_results.append({
                                "node_id": node.id,
                                "rule_idx": rule_idx,
                                "vulnerable": False,
                                "error": "state_change_blocked",
                            })
                            continue

                        # Mark test traffic so it can be excluded from production logs.
                        headers = mutated_req.get("headers") or {}
                        headers.setdefault("X-APISecurity-Test-ID", self.test_id)
                        mutated_req["headers"] = headers

                        # Auth Override (BOLA/BFLA pattern)
                        if auth_cfg.get('type') == 'override':
                            attacker_headers = await self.auth_rotator.get_auth_headers(
                                account_id="default_attacker",
                                role="ATTACKER"
                            )
                            mutated_req = self.auth_rotator.apply_auth(mutated_req, attacker_headers)

                        try:
                            resp = await client.request(
                                method=mutated_req['method'],
                                url=mutated_req['url'],
                                headers=mutated_req.get('headers'),
                                content=mutated_req.get('body')
                            )
                        except Exception as req_err:
                            final_results.append({
                                "node_id": node.id,
                                "rule_idx": rule_idx,
                                "vulnerable": False,
                                "error": str(req_err),
                            })
                            continue

                        response_data = {
                            "status_code": resp.status_code,
                            "headers": dict(resp.headers),
                            "body": resp.text,
                        }
                        last_response_data = response_data

                        if is_validation_node:
                            vulnerable = self.validator.validate(
                                response_data,
                                template.get('validate', {}),
                                original_response=baseline,
                            )
                        else:
                            vulnerable = (200 <= resp.status_code < 300)

                        final_results.append({
                            "node_id": node.id,
                            "rule_idx": rule_idx,
                            "vulnerable": vulnerable,
                            "response": {
                                "status_code": resp.status_code,
                                "headers": response_data["headers"],
                            },
                        })

                return last_response_data

        # 4. Execute the graph
        try:
            await executor.execute(graph, {}, run_node_step)
        except Exception as e:
            final_results.append({"error": str(e)})

        # A test run is vulnerable if ANY result was marked as vulnerable (usually the last/validation one)
        is_vulnerable = any(r.get("vulnerable", False) for r in final_results)

        return {
            "template_id": template['id'],
            "severity": template.get('info', {}).get('severity'),
            "is_vulnerable": is_vulnerable,
            "results": final_results,
            "context_variables": list(context_manager.store.keys()) # debugging info
        }

    def _build_graph(self, requests: list) -> Graph:
        """
        Converts the list of requests into a linear graph by default.
        """
        graph = Graph()
        prev_node_id = None
        
        for idx, req_cfg in enumerate(requests):
            node_id = f"step_{idx}"
            node = Node(id=node_id, type=NodeType.API, data=req_cfg)
            graph.add_node(node)
            
            if prev_node_id:
                graph.add_edge(prev_node_id, node_id)
            prev_node_id = node_id
            
        return graph

