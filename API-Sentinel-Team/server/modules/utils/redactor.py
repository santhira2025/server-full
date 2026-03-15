import json
import re
from typing import Any, Dict, List, Union

class Redactor:
    REDACT_VALUE = "****"
    SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie", "x-api-key", "token"}
    
    @classmethod
    def redact_json(cls, data: Union[Dict, List, str], level: int = 0) -> Union[Dict, List, str]:
        """Recursively redact sensitive fields in a JSON object or list."""
        if isinstance(data, str):
            try:
                # If it's a string, try to parse it as JSON
                parsed = json.loads(data)
                redacted = cls.redact_json(parsed, level + 1)
                return json.dumps(redacted)
            except:
                return data

        if isinstance(data, dict):
            new_dict = {}
            for k, v in data.items():
                # Check for sensitive keys
                if any(s in k.lower() for s in ["password", "secret", "token", "key", "auth", "cvv", "credit_card"]):
                    new_dict[k] = cls.REDACT_VALUE
                else:
                    new_dict[k] = cls.redact_json(v, level + 1)
            return new_dict

        if isinstance(data, list):
            return [cls.redact_json(item, level + 1) for item in data]

        return data

    @classmethod
    def redact_headers(cls, headers: Dict[str, str]) -> Dict[str, str]:
        """Redact sensitive HTTP headers."""
        new_headers = {}
        for k, v in headers.items():
            k_lower = k.lower()
            if k_lower in cls.SENSITIVE_HEADERS:
                if k_lower == "authorization":
                    # Keep the scheme (Bearer, Basic) but mask the token
                    parts = v.split(" ", 1)
                    if len(parts) > 1:
                        new_headers[k] = f"{parts[0]} {cls.REDACT_VALUE}"
                    else:
                        new_headers[k] = cls.REDACT_VALUE
                elif k_lower == "cookie":
                    # Redact value of each cookie
                    cookies = v.split(";")
                    redacted_cookies = []
                    for c in cookies:
                        if "=" in c:
                            name, _ = c.split("=", 1)
                            redacted_cookies.append(f"{name.strip()}={cls.REDACT_VALUE}")
                        else:
                            redacted_cookies.append(cls.REDACT_VALUE)
                    new_headers[k] = "; ".join(redacted_cookies)
                else:
                    new_headers[k] = cls.REDACT_VALUE
            else:
                new_headers[k] = v
        return new_headers

    @classmethod
    def redact_url(cls, url: str) -> str:
        """Redact query parameters in a URL."""
        if "?" not in url:
            return url
        
        base, query = url.split("?", 1)
        params = query.split("&")
        redacted_params = []
        for p in params:
            if "=" in p:
                name, _ = p.split("=", 1)
                redacted_params.append(f"{name}={cls.REDACT_VALUE}")
            else:
                redacted_params.append(p)
        
        return f"{base}?{'&'.join(redacted_params)}"
