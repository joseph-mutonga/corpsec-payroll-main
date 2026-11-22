import json
import logging
import datetime
from typing import Dict, Any, List, Optional

from application.backend.app.core.config import settings
from application.backend.app.schemas.ai_insights import ChatMessage

logger = logging.getLogger(__name__)

GEMINI_SYSTEM_INSTRUCTION = (
    "You are the CorpSec ERP System AI Assistant embedded in the Admin Dashboard. "
    "You have complete, direct, real-time access to the live CorpSec MySQL database, including:\n"
    "- Complete Guards Register (names, employee numbers, phone numbers, assigned sites, shifts, supervisors, salaries, and statuses).\n"
    "- Complete Field Supervisors Register (names, emails, phone numbers, assigned client sites, and deployed guards).\n"
    "- Complete Client Sites Register (site names, locations, client names, assigned supervisors, stationed guards, daily rates).\n"
    "- Shift Rosters, Client Contracts, Attendance Logs, Security Incidents, and Payroll Records.\n"
    "Your job is to answer the administrator's questions accurately, thoroughly, and professionally. "
    "Base your answers strictly on the provided real-time database records and telemetry. "
    "Always quote exact names, employee numbers, phone numbers, site names, and figures whenever relevant. "
    "If the administrator asks for lists (e.g., 'list all guards', 'who are the supervisors', 'what guards are at Westlands Mall?'), "
    "format your response using neat Markdown tables or bulleted lists with all details retrieved from the database. "
    "Never claim that you lack access to individual database records or that you can only see high-level metrics, because the full database records are provided right here in your grounding context. "
    "If a specific individual or record is not in the database records, explicitly mention that it was not found in the database."
)


class GeminiAIService:
    """
    Integrates with the Google Gemini API using the official google-genai SDK
    to analyze real-time system telemetry and operational performance metrics.
    """

    @staticmethod
    def get_client():
        """Instantiates the official Google GenAI Client if API key is configured."""
        api_key = (settings.GEMINI_API_KEY or "").strip()
        if not api_key:
            return None
        try:
            from google import genai
            return genai.Client(api_key=api_key)
        except Exception as e:
            logger.error(f"Failed to initialize Google GenAI Client: {e}")
            return None

    @classmethod
    def generate_grounded_fallback_analysis(
        cls,
        prompt: str,
        telemetry: Dict[str, Any],
        include_missing_key_note: bool = True
    ) -> str:
        """
        Provides an accurate, rule-grounded telemetry summary.
        If include_missing_key_note is True, advises setting GEMINI_API_KEY in .env.
        """
        host = telemetry.get("host_performance", {})
        db_stat = telemetry.get("database_telemetry", {})
        errors = telemetry.get("error_rates_and_alerts", {})
        ops = telemetry.get("workforce_and_operations", {})
        fin = telemetry.get("financial_and_payroll", {})

        p_lower = prompt.lower()

        latest_cycle = fin.get("latest_payroll_cycle") or {}
        cycle_name = latest_cycle.get("period_name", "None")
        cycle_status = latest_cycle.get("status", "N/A")
        cycle_gross = latest_cycle.get("total_gross_pay_kes", 0)

        response_lines = []
        if include_missing_key_note:
            response_lines.extend([
                "> [!NOTE]",
                "> **Gemini API Key Required for Generative Reasoning:** Set `GEMINI_API_KEY` in your `.env` to enable full autonomous Gemini LLM analysis. Below is the live, data-grounded telemetry snapshot queried directly from your system database.",
                ""
            ])
        else:
            response_lines.extend([
                "> [!NOTE]",
                "> **Real-Time Data-Grounded Analysis:** Below is the live telemetry snapshot queried directly from the system database and server host.",
                ""
            ])

        response_lines.extend([
            f"### 📊 Real-Time System Telemetry Report ({datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')})",
            "",
            "#### 🖥️ Server & Database Infrastructure",
            f"- **CPU Utilization:** `{host.get('cpu_percent', 'N/A')}%` ({host.get('cpu_cores_logical', 0)} logical cores)",
            f"- **RAM Memory Usage:** `{host.get('memory_percent', 'N/A')}%` ({host.get('memory_used_mb', 0)} MB / {host.get('memory_total_mb', 0)} MB)",
            f"- **Disk Storage Usage:** `{host.get('disk_percent', 'N/A')}%` ({host.get('disk_used_gb', 0)} GB used of {host.get('disk_total_gb', 0)} GB)",
            f"- **Database Ping Latency:** `{db_stat.get('latency_ms', 'N/A')} ms`",
            f"- **Active MySQL Client Threads:** `{db_stat.get('status_vars', {}).get('Threads_connected', 0)}` active connections",
            "",
            "#### 🚨 Critical Alerts & Bottlenecks",
            f"- **Unresolved Payroll Calculation Errors:** `{errors.get('unresolved_payroll_errors_total', 0)}` records (e.g. missing bank accounts, missing statutory NSSF/SHIF numbers)",
            f"- **Payroll Records on Hold:** `{errors.get('payroll_records_on_hold', 0)}` records",
            f"- **Open Security Incidents:** `{errors.get('open_security_incidents_total', 0)}` total (`{errors.get('critical_or_high_severity_incidents', 0)}` critical/high)",
            f"- **Missed Telephony Calls Today:** `{errors.get('missed_call_center_calls_today', 0)}` calls",
            "",
            "#### 🛡️ Workforce & Financial Status",
            f"- **Active Guard Deployments:** `{ops.get('active_guards_on_duty_roster', 0)}` active guards across `{ops.get('active_client_sites', 0)}` sites",
            f"- **Active Field Supervisors:** `{ops.get('active_field_supervisors', 0)}` supervisors",
            f"- **Monthly Recurring Revenue (MRR):** `KES {fin.get('monthly_recurring_revenue_mrr_kes', 0):,.2f}` ({fin.get('active_client_contracts', 0)} active contracts)",
            f"- **Latest Payroll Cycle ({cycle_name}):** Status `{cycle_status}`, Gross Pay `KES {cycle_gross:,.2f}`",
            "",
            "---"
        ])

        # Targeted Matches or Specific Registries when requested
        targeted = telemetry.get("targeted_database_matches", {})
        guards_reg = telemetry.get("guards_register", [])
        supervisors_reg = telemetry.get("supervisors_register", [])
        sites_reg = telemetry.get("client_sites_register", [])

        # Matched entities section if user search hit specific records
        if targeted and any(targeted.get(k) for k in ["matched_guards", "matched_supervisors", "matched_sites", "matched_incidents"]):
            response_lines.append("#### 🎯 Targeted Database Query Matches")
            if targeted.get("matched_guards"):
                response_lines.append("**Matching Guards in Database:**")
                for mg in targeted["matched_guards"]:
                    response_lines.append(f"- **{mg.get('full_name')}** (`{mg.get('employee_number')}`) | Phone: `{mg.get('phone')}` | Site: `{mg.get('assigned_site')}` | Shift: `{mg.get('assigned_shift')}` | Supervisor: `{mg.get('supervisor')}` | Salary: `KES {mg.get('basic_salary_kes', 0):,.2f}` | Status: `{mg.get('status')}`")
                response_lines.append("")
            if targeted.get("matched_supervisors"):
                response_lines.append("**Matching Field Supervisors in Database:**")
                for ms in targeted["matched_supervisors"]:
                    g_list = ", ".join(ms.get("assigned_guards", [])) or "None assigned"
                    s_list = ", ".join(ms.get("assigned_sites", [])) or "None assigned"
                    response_lines.append(f"- **{ms.get('full_name')}** | Email: `{ms.get('email')}` | Phone: `{ms.get('phone')}` | Assigned Sites: `{s_list}` | Guards ({ms.get('assigned_guards_count', 0)}): {g_list}")
                response_lines.append("")
            if targeted.get("matched_sites"):
                response_lines.append("**Matching Client Sites in Database:**")
                for mst in targeted["matched_sites"]:
                    sg_list = ", ".join(mst.get("stationed_guards", [])) or "None assigned"
                    response_lines.append(f"- **{mst.get('site_name')}** ({mst.get('client_name')}) | Location: `{mst.get('location')}` | Supervisor: `{mst.get('supervisor')}` | Stationed Guards ({mst.get('stationed_guards_count', 0)}): {sg_list}")
                response_lines.append("")

        # Complete Guards Register if asked
        if any(w in p_lower for w in ["guard", "guards", "roster", "all guard"]):
            response_lines.extend([
                "#### 🛡️ Complete Active Guards Register (Queried from Database)",
                "| Guard Name | Emp Number | Phone | Assigned Site | Shift | Supervisor | Basic Salary | Status |",
                "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
            ])
            for g in guards_reg:
                response_lines.append(
                    f"| **{g.get('full_name')}** | `{g.get('employee_number')}` | `{g.get('phone')}` | {g.get('assigned_site')} | {g.get('assigned_shift')} | {g.get('supervisor_name')} | KES {g.get('basic_salary_kes', 0):,.2f} | `{g.get('status')}` |"
                )
            response_lines.append("")

        # Complete Supervisors Register if asked
        if any(w in p_lower for w in ["supervisor", "supervisors"]):
            response_lines.extend([
                "#### 👨‍💼 Complete Field Supervisors Register (Queried from Database)",
                "| Supervisor Name | Official Email | Phone | Assigned Sites | Guards Under Supervision | Status |",
                "| :--- | :--- | :--- | :--- | :--- | :--- |"
            ])
            for s in supervisors_reg:
                s_sites = ", ".join(s.get("assigned_sites", [])) or "None"
                s_guards = ", ".join([g.get("full_name") for g in s.get("assigned_guards", [])]) or "None"
                response_lines.append(
                    f"| **{s.get('full_name')}** | `{s.get('email')}` | `{s.get('phone')}` | {s_sites} | {s_guards} ({s.get('assigned_guards_count', 0)}) | `{s.get('status')}` |"
                )
            response_lines.append("")

        # Complete Sites Register if asked
        if any(w in p_lower for w in ["site", "sites", "client site"]):
            response_lines.extend([
                "#### 🏢 Client Sites Register (Queried from Database)",
                "| Site Name | Client Name | Location | Assigned Supervisor | Daily Rate | Stationed Guards |",
                "| :--- | :--- | :--- | :--- | :--- | :--- |"
            ])
            for st in sites_reg:
                st_guards = ", ".join([g.get("full_name") for g in st.get("stationed_guards", [])]) or "None"
                response_lines.append(
                    f"| **{st.get('site_name')}** | {st.get('client_name')} | {st.get('location')} | {st.get('assigned_supervisor')} | KES {st.get('daily_rate_kes', 0):,.2f} | {st_guards} ({st.get('stationed_guards_count', 0)}) |"
                )
            response_lines.append("")

        if include_missing_key_note:
            response_lines.append("*To ask natural-language questions with Gemini, add your `GEMINI_API_KEY` to the `.env` file on the server.*")

        return "\n".join(response_lines)

    @classmethod
    async def analyze_system_insights(
        cls,
        prompt: str,
        telemetry: Dict[str, Any],
        history: Optional[List[ChatMessage]] = None
    ) -> Dict[str, Any]:
        """
        Sends the telemetry context and administrator prompt to Google Gemini model.
        Returns the data-grounded response and metadata.
        """
        client = cls.get_client()
        model_name = getattr(settings, "GEMINI_MODEL", None) or "gemini-3.5-flash-lite"
        timestamp = datetime.datetime.now().isoformat()

        # If API key is not configured, return grounded rule-based telemetry analysis
        if not client:
            answer = cls.generate_grounded_fallback_analysis(prompt, telemetry)
            return {
                "status": "key_required",
                "answer": answer,
                "model_used": "system-grounded-telemetry-engine",
                "timestamp": timestamp,
                "has_api_key": False,
                "grounding_metrics_summary": {
                    "cpu_percent": telemetry.get("host_performance", {}).get("cpu_percent"),
                    "memory_percent": telemetry.get("host_performance", {}).get("memory_percent"),
                    "db_latency_ms": telemetry.get("database_telemetry", {}).get("latency_ms"),
                    "unresolved_payroll_errors": telemetry.get("error_rates_and_alerts", {}).get("unresolved_payroll_errors_total"),
                    "active_guards": telemetry.get("workforce_and_operations", {}).get("active_guards_on_duty_roster"),
                }
            }

        # Build Grounded Context block
        telemetry_json = json.dumps(telemetry, indent=2)
        grounding_context = (
            "======================================================================\n"
            "REAL-TIME SYSTEM PERFORMANCE, TELEMETRY & DATABASE LOGS (GROUNDING DATA)\n"
            "======================================================================\n"
            f"{telemetry_json}\n"
            "======================================================================\n"
            "ADMINISTRATOR QUESTION:\n"
            f"{prompt}\n"
        )

        try:
            from google.genai import types

            # Format conversation history if provided
            contents = []
            if history:
                for msg in history:
                    r = "user" if msg.role == "user" else "model"
                    contents.append(types.Content(
                        role=r,
                        parts=[types.Part.from_text(text=msg.content)]
                    ))

            # Add current grounded user query
            contents.append(types.Content(
                role="user",
                parts=[types.Part.from_text(text=grounding_context)]
            ))

            config = types.GenerateContentConfig(
                system_instruction=GEMINI_SYSTEM_INSTRUCTION,
                temperature=0.2,  # Low temperature for strict factual grounding
                max_output_tokens=2048,
            )

            # High availability: prioritize high-throughput, low-latency models and cascade
            candidate_models = []
            if model_name:
                candidate_models.append(model_name)
            for fallback_m in [
                "gemini-3.8-flash",
                "gemini-3.1-flash-lite",
                "gemini-3.5-flash",
                "gemini-2.5-flash-lite",
            ]:
                if fallback_m not in candidate_models:
                    candidate_models.append(fallback_m)

            response = None
            successful_model = candidate_models[0]
            last_error = None

            for m in candidate_models:
                try:
                    response = client.models.generate_content(
                        model=m,
                        contents=contents,
                        config=config
                    )
                    successful_model = m
                    break
                except Exception as model_err:
                    last_error = model_err
                    logger.warning(f"Gemini model {m} encountered error: {model_err}. Trying next candidate...")

            if not response:
                raise last_error or RuntimeError("All Gemini candidate models failed to respond.")

            generated_text = (response.text or "").strip()
            if not generated_text:
                generated_text = "I analyzed the system telemetry, but no content was returned by the model."

            return {
                "status": "success",
                "answer": generated_text,
                "model_used": successful_model,
                "timestamp": timestamp,
                "has_api_key": True,
                "grounding_metrics_summary": {
                    "cpu_percent": telemetry.get("host_performance", {}).get("cpu_percent"),
                    "memory_percent": telemetry.get("host_performance", {}).get("memory_percent"),
                    "db_latency_ms": telemetry.get("database_telemetry", {}).get("latency_ms"),
                    "unresolved_payroll_errors": telemetry.get("error_rates_and_alerts", {}).get("unresolved_payroll_errors_total"),
                    "active_guards": telemetry.get("workforce_and_operations", {}).get("active_guards_on_duty_roster"),
                }
            }

        except Exception as e:
            logger.error(f"Error calling Gemini API: {e}", exc_info=True)
            error_str = str(e)
            if "503" in error_str or "high demand" in error_str.lower():
                notice_msg = "Google Gemini is currently experiencing high global traffic spikes."
            elif "429" in error_str or "quota" in error_str.lower():
                notice_msg = "Gemini free-tier request rate limit was reached on heavy models."
            else:
                notice_msg = f"Gemini API returned a temporary service notification: {error_str}"

            # If the API call fails across all candidates, gracefully fallback to grounded telemetry
            fallback_answer = (
                f"> [!WARNING]\n"
                f"> **Gemini API Temporary Notice:** {notice_msg} "
                f"Displaying real-time system telemetry gathered directly from the database and server host:\n\n"
                + cls.generate_grounded_fallback_analysis(prompt, telemetry, include_missing_key_note=False)
            )
            return {
                "status": "error",
                "answer": fallback_answer,
                "model_used": model_name,
                "timestamp": timestamp,
                "has_api_key": True,
                "grounding_metrics_summary": {
                    "cpu_percent": telemetry.get("host_performance", {}).get("cpu_percent"),
                    "memory_percent": telemetry.get("host_performance", {}).get("memory_percent"),
                    "db_latency_ms": telemetry.get("database_telemetry", {}).get("latency_ms"),
                }
            }
