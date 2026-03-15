"""Nuclei vulnerability scanner integration — wraps CLI or simulates in dev mode."""
import asyncio
import json
import logging
import shutil
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)
NUCLEI_BIN = shutil.which("nuclei") or "nuclei"


class NucleiRunner:
    @staticmethod
    def is_available() -> bool:
        return shutil.which("nuclei") is not None

    @staticmethod
    async def run_scan(
        target: str,
        template_ids: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        severity: Optional[List[str]] = None,
        extra_template_paths: Optional[List[str]] = None,
        timeout: int = 120,
    ) -> Dict[str, Any]:
        if not NucleiRunner.is_available():
            return NucleiRunner._simulate(target)

        cmd = [NUCLEI_BIN, "-target", target, "-json", "-silent", "-timeout", str(timeout)]
        if template_ids:
            cmd += ["-id", ",".join(template_ids)]
        if tags:
            cmd += ["-tags", ",".join(tags)]
        if severity:
            cmd += ["-severity", ",".join(severity)]
        for path in (extra_template_paths or []):
            cmd += ["-t", path]

        findings = []
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout + 30)
            for line in stdout.decode().splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    findings.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
            return {"status": "COMPLETED", "findings": findings, "total_found": len(findings)}
        except asyncio.TimeoutError:
            return {"status": "TIMEOUT", "findings": findings, "total_found": len(findings)}
        except Exception as e:
            logger.error(f"Nuclei error: {e}")
            return {"status": "FAILED", "findings": [], "total_found": 0, "error": str(e)}

    @staticmethod
    def _simulate(target: str) -> Dict[str, Any]:
        mock = [{
            "template-id": "CVE-2021-41773",
            "name": "Apache Path Traversal (simulated)",
            "severity": "critical",
            "host": target,
            "matched-at": f"{target}/cgi-bin/.%2e/etc/passwd",
            "info": {"description": "Nuclei binary not installed — simulation mode"},
        }]
        return {"status": "COMPLETED_SIMULATED", "findings": mock, "total_found": len(mock),
                "note": "nuclei binary not installed; install from https://github.com/projectdiscovery/nuclei"}
