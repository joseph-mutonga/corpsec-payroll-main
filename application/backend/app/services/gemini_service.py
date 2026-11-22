import json
import logging
import datetime
from typing import Dict, Any, List, Optional

from application.backend.app.core.config import settings
from application.backend.app.schemas.ai_insights import ChatMessage

logger = logging.getLogger(__name__)

GEMINI_SYSTEM_INSTRUCTION = (
    "You are an expert System Performance Analyst embedded in the Admin Dashboard. "
    "Your job is to analyze the provided system telemetry, database metrics, and logs to answer the "
    "administrator's questions accurately. Base your answers strictly on the provided system data. "
    "If the data needed to answer a question is missing or unavailable, explicitly state that you do not have "
    "access to that metric—never guess or hallucinate numbers. "
    "Highlight anomalies, bottlenecks, or critical alerts clearly using bullet points and concise summaries."
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
                "gemini-3.5-flash-lite",
                "gemini-3.1-flash-lite",
                "gemini-3.5-flash",
                "gemini-3.7-flash",
                "gemini-3.8-flash"
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
