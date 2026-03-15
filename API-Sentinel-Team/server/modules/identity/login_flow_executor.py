import httpx
import logging
from typing import Dict, Any, List, Optional
from server.modules.test_executor.context_manager import ContextManager
from server.modules.test_executor.request_mutator import RequestMutator

logger = logging.getLogger(__name__)

class LoginFlowExecutor:
    """
    Executes a series of steps to authenticate a user and extract tokens.
    Used for automated BOLA/BFLA testing where valid sessions are required for multiple roles.
    """
    def __init__(self):
        self.mutator = RequestMutator()

    async def execute_login(self, flow_cfg: Dict[str, Any], credentials: Dict[str, str]) -> Dict[str, str]:
        """
        Executes the login workflow.
        Returns a dictionary of extracted tokens/cookies.
        """
        context = ContextManager()
        # Seed context with credentials
        for k, v in credentials.items():
            context.store[k] = v
            
        auth_tokens = {}
        steps = flow_cfg.get('steps', [])

        async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
            for step in steps:
                # 1. Prepare request
                request_data = context.substitute_variables(step.get('request', {}), context.store)
                
                # 2. Execute
                resp = await client.request(
                    method=request_data.get('method', 'POST'),
                    url=request_data.get('url'),
                    headers=request_data.get('headers'),
                    content=request_data.get('body')
                )
                
                # 3. Extract tokens if defined
                # Example: extract from JSON response or Set-Cookie header
                response_json = {}
                try: response_json = resp.json()
                except: pass

                extraction_rules = step.get('extract', [])
                context.extract_from_response({
                    "status_code": resp.status_code,
                    "headers": dict(resp.headers),
                    "body": resp.text
                }, extraction_rules)
                
                # Accumulate tokens from context
                for rule in extraction_rules:
                    key = rule.get('key')
                    if key in context.store:
                        auth_tokens[key] = context.store[key]

        return auth_tokens
