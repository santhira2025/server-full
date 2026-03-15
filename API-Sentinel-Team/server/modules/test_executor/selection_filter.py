import re
import json
from urllib.parse import urlparse


class SelectionFilterEngine:
    """
    Decides whether a given YAML template should run against a given endpoint.
    Mirrors Akto's api_selection_filters DSL — all 10+ filter keys implemented.
    """

    def should_run(self, template: dict, endpoint: dict, roles_context: dict = None) -> tuple[bool, dict]:
        """
        Returns (should_run: bool, extracted_vars: dict).
        extracted_vars holds values like urlVar, userKey extracted by filters.
        """
        filters = template.get("api_selection_filters", {})
        extracted = {}

        # 1. Method filter
        method_rule = filters.get("method")
        if method_rule and not self._check_method(method_rule, endpoint.get("method", "")):
            return False, {}

        # 2. Response code filter
        code_rule = filters.get("response_code")
        if code_rule:
            last_code = endpoint.get("last_response_code", 200)
            # Allow extract from code filter
            if isinstance(code_rule, dict) and "extract" in code_rule:
                extracted[code_rule["extract"]] = last_code
                code_rule = {k: v for k, v in code_rule.items() if k != "extract"}
            if not self._check_code(code_rule, last_code):
                return False, {}

        # 3. URL filter — extract full URL for use in modify_url (90 templates)
        url_rule = filters.get("url")
        if url_rule:
            full_url = endpoint.get("url", "")
            if not full_url:
                proto = endpoint.get("protocol", "http")
                host = endpoint.get("host", "")
                path = endpoint.get("path", "/")
                full_url = f"{proto}://{host}{path}"
            if isinstance(url_rule, dict) and "extract" in url_rule:
                extracted[url_rule["extract"]] = full_url
            elif url_rule:  # plain extract shorthand: url: { extract: varName }
                pass

        # 4. Response payload filter
        payload_rule = filters.get("response_payload")
        if payload_rule:
            last_body = endpoint.get("last_response_body", "")
            if not self._check_payload(payload_rule, last_body):
                return False, {}

        # 5. Response headers filter (response_headers plural — selection filter)
        resp_headers_rule = filters.get("response_headers")
        if resp_headers_rule:
            last_headers = endpoint.get("last_response_headers", {})
            if not self._check_header_filter(resp_headers_rule, last_headers):
                return False, {}

        # 6. Request payload filter — extract variable names (e.g. userKey, payloadKeys)
        req_payload_rule = filters.get("request_payload")
        if req_payload_rule:
            ok, found = self._check_request_payload(req_payload_rule, endpoint.get("last_request_body", ""))
            if not ok:
                return False, {}
            extracted.update(found)

        # 7. param_context — extract param name+value pair for BOLA tests
        param_ctx_rule = filters.get("param_context")
        if param_ctx_rule:
            ok, found = self._check_param_context(param_ctx_rule, endpoint)
            if not ok:
                return False, {}
            extracted.update(found)

        # 8. OR logic across multiple filter branches
        or_rules = filters.get("or")
        if or_rules:
            passed_or = False
            for or_rule in or_rules:
                ok, found = self._check_or_rule(or_rule, endpoint)
                if ok:
                    extracted.update(found)
                    passed_or = True
                    break
            if not passed_or:
                return False, {}

        # 9. Roles access filter (BFLA)
        include_roles = filters.get("include_roles_access")
        if include_roles and roles_context:
            role_name = include_roles.get("param")
            if role_name not in roles_context:
                return False, {}

        exclude_roles = filters.get("exclude_roles_access")
        if exclude_roles and roles_context:
            role_name = exclude_roles.get("param")
            if role_name in roles_context:
                return False, {}

        # 10. Private variable context (endpoint has user-specific params)
        pvc_rule = filters.get("private_variable_context")
        if pvc_rule:
            pvc_count = endpoint.get("private_variable_count", 0)
            if not self._check_numeric(pvc_rule, pvc_count):
                return False, {}

        # 11. auth.authenticated — skip endpoints that have no auth headers observed
        auth_filter = filters.get("auth")
        if auth_filter and isinstance(auth_filter, dict):
            requires_auth = auth_filter.get("authenticated")
            if requires_auth is True:
                # Endpoint must have seen at least one auth token type
                auth_types = endpoint.get("auth_types_found", [])
                if not auth_types:
                    return False, {}
            elif requires_auth is False:
                # Template targets unauthenticated endpoints only
                auth_types = endpoint.get("auth_types_found", [])
                if auth_types:
                    return False, {}

        # 12. endpoint_in_traffic_context — endpoint must have captured sample data
        if filters.get("endpoint_in_traffic_context"):
            has_sample = bool(
                endpoint.get("last_request_body")
                or endpoint.get("last_response_body")
            )
            if not has_sample:
                return False, {}

        return True, extracted

    # ── Method ────────────────────────────────────────────────────────────────

    def _check_method(self, rule: dict, method: str) -> bool:
        method = method.upper()
        if "eq" in rule and method != rule["eq"].upper():
            return False
        if "neq" in rule and method == rule["neq"].upper():
            return False
        if "contains" in rule:
            methods = [m.upper() for m in (rule["contains"] if isinstance(rule["contains"], list) else [rule["contains"]])]
            if method not in methods:
                return False
        if "not_contains" in rule:
            methods = [m.upper() for m in (rule["not_contains"] if isinstance(rule["not_contains"], list) else [rule["not_contains"]])]
            if method in methods:
                return False
        return True

    # ── Code ──────────────────────────────────────────────────────────────────

    def _check_code(self, rule: dict, code: int) -> bool:
        if "gte" in rule and code < rule["gte"]:
            return False
        if "lt" in rule and code >= rule["lt"]:
            return False
        if "eq" in rule and code != rule["eq"]:
            return False
        if "neq" in rule and code == rule["neq"]:
            return False
        return True

    # ── Numeric ───────────────────────────────────────────────────────────────

    def _check_numeric(self, rule: dict, value) -> bool:
        if "gt" in rule and value <= rule["gt"]:
            return False
        if "gte" in rule and value < rule["gte"]:
            return False
        if "lt" in rule and value >= rule["lt"]:
            return False
        if "lte" in rule and value > rule["lte"]:
            return False
        return True

    # ── Payload ───────────────────────────────────────────────────────────────

    def _check_payload(self, rule: dict, body: str) -> bool:
        body_lower = body.lower()
        length_rule = rule.get("length")
        if length_rule and not self._check_numeric(length_rule, len(body)):
            return False

        for item in rule.get("not_contains", []):
            if item.lower() in body_lower:
                return False

        for item in rule.get("contains", []):
            if item.lower() not in body_lower:
                return False

        items_all = rule.get("contains_all", [])
        if isinstance(items_all, str):
            items_all = [items_all]
        for item in items_all:
            if item.lower() not in body_lower:
                return False

        items_either = rule.get("contains_either", [])
        if isinstance(items_either, str):
            items_either = [items_either]
        if items_either and not any(item.lower() in body_lower for item in items_either):
            return False

        return True

    # ── Response headers (selection filter) ───────────────────────────────────

    def _check_header_filter(self, rule: dict, headers: dict) -> bool:
        lower_headers = {k.lower(): v for k, v in headers.items()}
        for_one = rule.get("for_one", {})
        if not for_one:
            return True
        key_rule = for_one.get("key", {})
        value_rule = for_one.get("value", {})
        for k, v in lower_headers.items():
            k_match = True
            if "eq" in key_rule and k != key_rule["eq"].lower():
                k_match = False
            if "regex" in key_rule and not re.search(key_rule["regex"], k, re.IGNORECASE):
                k_match = False
            if not k_match:
                continue
            if not value_rule:
                return True
            if "eq" in value_rule and v.lower() == value_rule["eq"].lower():
                return True
            if "regex" in value_rule and re.search(value_rule["regex"], v, re.IGNORECASE):
                return True
            if "contains" in value_rule and value_rule["contains"].lower() in v.lower():
                return True
        return False

    # ── Request payload ───────────────────────────────────────────────────────

    def _check_request_payload(self, rule: dict, body: str) -> tuple[bool, dict]:
        """Check for_one/for_all in request body; supports extract and extractMultiple."""
        extracted = {}
        for_one = rule.get("for_one")
        if not for_one:
            return True, extracted

        key_rule = for_one.get("key", {})
        value_rule = for_one.get("value", {})
        extract_as = key_rule.get("extract")
        extract_multiple_as = key_rule.get("extractMultiple")
        regex_pattern = key_rule.get("regex", ".*")
        not_contains = key_rule.get("not_contains")

        try:
            body_json = json.loads(body) if body else {}
        except Exception:
            return False, {}

        matched_keys = []
        for k in body_json.keys():
            k_str = str(k)
            if not re.search(regex_pattern, k_str, re.IGNORECASE):
                continue
            if not_contains:
                nc_list = not_contains if isinstance(not_contains, list) else [not_contains]
                if any(nc in k_str for nc in nc_list):
                    continue
            # Value filter
            if value_rule:
                v = body_json[k]
                if "datatype" in value_rule:
                    dt = value_rule["datatype"]
                    if dt == "number" and not isinstance(v, (int, float)):
                        continue
                    if dt == "string" and not isinstance(v, str):
                        continue
            matched_keys.append(k_str)

        if not matched_keys:
            return False, {}

        if extract_as:
            extracted[extract_as] = matched_keys[0]
        if extract_multiple_as:
            extracted[extract_multiple_as] = matched_keys

        return True, extracted

    # ── param_context ─────────────────────────────────────────────────────────

    def _check_param_context(self, rule: dict, endpoint: dict) -> tuple[bool, dict]:
        """
        Extract param name+value from endpoint's last request body
        where param name matches the given regex. Used by BOLA tests.
        Returns extracted {extract_var: {key: paramName, value: paramValue}}.
        """
        extracted = {}
        param_regex = rule.get("param", "")
        extract_as = rule.get("extract", "user_context")

        body = endpoint.get("last_request_body", "")
        try:
            body_json = json.loads(body) if body else {}
        except Exception:
            return False, {}

        for k, v in body_json.items():
            if re.search(param_regex, str(k), re.IGNORECASE):
                extracted[extract_as] = {"key": k, "value": v}
                return True, extracted

        return False, {}

    # ── OR rule ───────────────────────────────────────────────────────────────

    def _check_or_rule(self, or_rule: dict, endpoint: dict) -> tuple[bool, dict]:
        """Handle a single OR branch."""
        extracted = {}

        if "request_payload" in or_rule:
            ok, found = self._check_request_payload(
                or_rule["request_payload"], endpoint.get("last_request_body", "")
            )
            if ok:
                return True, found

        if "query_param" in or_rule:
            ok, found = self._check_query_param(
                or_rule["query_param"], endpoint.get("last_query_string", "")
            )
            if ok:
                return True, found

        return False, {}

    # ── Query param ───────────────────────────────────────────────────────────

    def _check_query_param(self, rule: dict, query_string: str) -> tuple[bool, dict]:
        extracted = {}
        for_one = rule.get("for_one")
        if not for_one:
            return True, extracted

        key_rule = for_one.get("key", {})
        value_rule = for_one.get("value", {})
        regex_pattern = key_rule.get("regex", ".*")
        extract_as = key_rule.get("extract")
        extract_multiple_as = key_rule.get("extractMultiple")

        params = {}
        for part in query_string.split("&"):
            if "=" in part:
                k, v = part.split("=", 1)
                params[k] = v

        matched = []
        for k, v in params.items():
            if re.search(regex_pattern, k, re.IGNORECASE):
                # Value filter
                if value_rule:
                    v_str = str(v)
                    if "contains_either" in value_rule:
                        clist = value_rule["contains_either"]
                        if isinstance(clist, str):
                            clist = [clist]
                        if not any(c.lower() in v_str.lower() for c in clist):
                            continue
                matched.append(k)

        if not matched:
            return False, {}

        if extract_as:
            extracted[extract_as] = matched[0]
        if extract_multiple_as:
            extracted[extract_multiple_as] = matched

        return True, extracted
