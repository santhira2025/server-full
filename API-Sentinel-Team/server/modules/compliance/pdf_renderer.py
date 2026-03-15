import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class PDFRenderer:
    """
    Renders security reports as human-readable HTML/PDF.
    """
    def generate_html(self, report: Dict[str, Any]) -> str:
        """
        Takes the compliance report JSON and builds a CSS-styled HTML page.
        """
        framework = report.get('framework', 'Security Report')
        summary = f"Total Open Vulnerabilities: {report.get('total_open', 0)}"
        
        sections_html = ""
        for section, vulns in report.get('sections', {}).items():
            vuln_rows = "".join([
                f"""<tr>
                    <td>{v['severity']}</td>
                    <td>{v['title']}</td>
                    <td>{v['endpoint']}</td>
                </tr>""" for v in vulns
            ])
            
            sections_html += f"""
                <div class="section">
                    <h3>{section}</h3>
                    <table>
                        <thead>
                            <tr><th>Severity</th><th>Problem</th><th>Endpoint</th></tr>
                        </thead>
                        <tbody>{vuln_rows}</tbody>
                    </table>
                </div>
            """

        html = f"""
        <html>
        <head>
            <style>
                body {{ font-family: sans-serif; padding: 20px; }}
                h1 {{ color: #d32f2f; }}
                .section {{ margin-bottom: 30px; }}
                table {{ width: 100%; border-collapse: collapse; }}
                th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
                th {{ background-color: #f5f5f5; }}
            </style>
        </head>
        <body>
            <h1>Compliance Report: {framework}</h1>
            <p><strong>{summary}</strong></p>
            {sections_html}
        </body>
        </html>
        """
        return html

    async def save_pdf(self, html: str, filepath: str) -> bool:
        """
        Placeholder for real PDF rendering (e.g. using weasyprint or pdfkit).
        """
        try:
            with open(filepath, 'w') as f:
                f.write(html)
            return True
        except Exception as e:
            logger.error(f"Failed to save PDF: {e}")
            return False
