import json
import logging
import datetime
import time
import asyncio
import inspect
from typing import Dict, Any, List, Optional, AsyncGenerator

from application.backend.app.core.config import settings
from application.backend.app.schemas.ai_insights import ChatMessage

logger = logging.getLogger(__name__)

GEMINI_SYSTEM_INSTRUCTION = (
    "You are the CorpSec ERP System AI Assistant embedded in the Admin Dashboard. "
    "You have real-time, data-grounded access to live CorpSec MySQL database telemetry and business registers:\n"
    "- Complete Active Guards Register (employee numbers, names, phone numbers, assigned sites, shifts, supervisors, salaries).\n"
    "- Complete Field Supervisors Register (names, emails, phone numbers, assigned sites, deployed guards).\n"
    "- Client Sites & Contracts (site names, locations, client names, daily rates, monthly charges/MRR).\n"
    "- Shift Rosters, Attendance Records, Incident Logs, and Statutory Payroll (NSSF, SHIF, Housing Levy, PAYE).\n"
    "Guidelines:\n"
    "1. Base answers STRICTLY on the real-time database grounding data provided. Never hallucinate names, figures, or records.\n"
    "2. If requested records or details are not in the grounding data, state clearly and transparently that they were not found.\n"
    "3. Format lists and rosters using neat, clean Markdown tables or organized bulleted sections.\n"
    "4. Clearly distinguish actual database facts from administrative recommendations.\n"
    "5. Include relevant reporting dates and figures from the database."
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

        p_lower = prompt.lower().strip()

        # Conversational greeting handler
        if p_lower in ["hello", "hi", "hey", "greetings", "good morning", "good afternoon", "good evening", "habari", "hello!"]:
            return (
                "Hello, Administrator! I am the CorpSec ERP System AI Assistant, connected live to the MySQL database and operational registers.\n\n"
                f"- **Active Guards on Duty:** {ops.get('active_guards_on_duty_roster', 0)} of {ops.get('total_guards_registered', 0)} registered guards\n"
                f"- **Active Client Sites:** {ops.get('active_client_sites', 0)} sites monitored\n"
                f"- **Active Field Supervisors:** {ops.get('active_field_supervisors', 0)} supervisors\n"
                f"- **Database Status:** Healthy (Latency: {db_stat.get('latency_ms', 'N/A')} ms, {db_stat.get('status_vars', {}).get('Threads_connected', 0)} active threads)\n\n"
                "How can I assist you today with active guards, field supervisors, client sites, shift rosters, or statutory payroll records?"
            )

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
    def _build_grounding_context(cls, prompt: str, telemetry: Dict[str, Any], category: Optional[str] = None) -> str:
        """
        Builds concise, category-tailored grounding context to minimize token overhead.
        """
        cat = category or telemetry.get("query_classification") or "COMPLEX"
        
        # Simple health/ping context
        if cat == "SIMPLE":
            host = telemetry.get("host_performance", {})
            db_stat = telemetry.get("database_telemetry", {})
            ops = telemetry.get("workforce_and_operations", {})
            compact_ctx = {
                "server_cpu_percent": host.get("cpu_percent"),
                "server_memory_used_mb": host.get("memory_used_mb"),
                "server_memory_percent": host.get("memory_percent"),
                "mysql_latency_ms": db_stat.get("latency_ms"),
                "mysql_active_threads": db_stat.get("status_vars", {}).get("Threads_connected"),
                "active_guards_on_duty": ops.get("active_guards_on_duty_roster"),
                "total_guards_registered": ops.get("total_guards_registered"),
                "reporting_timestamp": telemetry.get("data_freshness", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            }
            return (
                "=== REAL-TIME INFRASTRUCTURE STATUS (GROUNDING DATA) ===\n"
                f"{json.dumps(compact_ctx, indent=2)}\n"
                "========================================================\n"
                f"ADMINISTRATOR QUESTION: {prompt}\n"
            )

        # Full or category-filtered context
        telemetry_json = json.dumps(telemetry, indent=2)
        return (
            "======================================================================\n"
            f"REAL-TIME SYSTEM DATABASE & OPERATIONAL TELEMETRY [{cat}]\n"
            "======================================================================\n"
            f"{telemetry_json}\n"
            "======================================================================\n"
            f"ADMINISTRATOR QUESTION:\n{prompt}\n"
        )

    @classmethod
    async def analyze_system_insights(
        cls,
        prompt: str,
        telemetry: Dict[str, Any],
        history: Optional[List[ChatMessage]] = None,
        category: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Sends the telemetry context and administrator prompt to Google Gemini model.
        Returns the data-grounded response and metadata using non-blocking async calls.
        """
        t0 = time.perf_counter()
        client = cls.get_client()
        model_name = getattr(settings, "GEMINI_MODEL", None) or "gemini-3.5-flash-lite"
        timestamp = datetime.datetime.now().isoformat()
        cat = category or telemetry.get("query_classification") or "COMPLEX"

        # If API key is not configured, return grounded rule-based telemetry analysis
        if not client:
            answer = cls.generate_grounded_fallback_analysis(prompt, telemetry)
            return {
                "status": "key_required",
                "answer": answer,
                "model_used": "system-grounded-telemetry-engine",
                "timestamp": timestamp,
                "has_api_key": False,
                "category": cat,
                "db_query_time_ms": telemetry.get("db_query_time_ms", 0.0),
                "gemini_latency_ms": 0.0,
                "total_duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                "grounding_metrics_summary": {
                    "cpu_percent": telemetry.get("host_performance", {}).get("cpu_percent"),
                    "memory_percent": telemetry.get("host_performance", {}).get("memory_percent"),
                    "db_latency_ms": telemetry.get("database_telemetry", {}).get("latency_ms"),
                    "unresolved_payroll_errors": telemetry.get("error_rates_and_alerts", {}).get("unresolved_payroll_errors_total"),
                    "active_guards": telemetry.get("workforce_and_operations", {}).get("active_guards_on_duty_roster"),
                }
            }

        # Build Grounded Context block
        grounding_context = cls._build_grounding_context(prompt, telemetry, cat)

        try:
            from google.genai import types

            # Format conversation history (limit to last 4 messages to save tokens and latency)
            contents = []
            trimmed_history = (history or [])[-4:]
            for msg in trimmed_history:
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

            # Candidate models cascade (prioritizing low latency)
            candidate_models = []
            if model_name:
                candidate_models.append(model_name)
            for fallback_m in [
                "gemini-3.5-flash-lite",
                "gemini-3.5-flash",
                "gemini-3.1-flash-lite",
                "gemini-3.8-flash",
            ]:
                if fallback_m not in candidate_models:
                    candidate_models.append(fallback_m)

            response = None
            successful_model = candidate_models[0]
            last_error = None

            for m in candidate_models:
                try:
                    cfg_kwargs: Dict[str, Any] = {
                        "system_instruction": GEMINI_SYSTEM_INSTRUCTION,
                        "temperature": 0.2,
                        "max_output_tokens": 2048,
                    }
                    # Lower thinking for fast domain questions where model supports it
                    if cat in ["SIMPLE", "WORKFORCE"] and m in ["gemini-3.5-flash", "gemini-3.7-flash"]:
                        cfg_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)

                    config = types.GenerateContentConfig(**cfg_kwargs)

                    t_gemini_call = time.perf_counter()
                    # Non-blocking async API call with awaitable check
                    if hasattr(client, "aio") and hasattr(client.aio, "models"):
                        gen_res = client.aio.models.generate_content(
                            model=m,
                            contents=contents,
                            config=config
                        )
                        if inspect.isawaitable(gen_res):
                            response = await gen_res
                        else:
                            response = gen_res
                    else:
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

            gemini_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            db_time = telemetry.get("db_query_time_ms", 0.0)

            return {
                "status": "success",
                "answer": generated_text,
                "model_used": successful_model,
                "timestamp": timestamp,
                "has_api_key": True,
                "category": cat,
                "db_query_time_ms": db_time,
                "gemini_latency_ms": gemini_latency_ms,
                "total_duration_ms": round(db_time + gemini_latency_ms, 2),
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

            # Fallback to pure database-grounded telemetry report
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
                "category": cat,
                "db_query_time_ms": telemetry.get("db_query_time_ms", 0.0),
                "gemini_latency_ms": round((time.perf_counter() - t0) * 1000, 2),
                "total_duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                "grounding_metrics_summary": {
                    "cpu_percent": telemetry.get("host_performance", {}).get("cpu_percent"),
                    "memory_percent": telemetry.get("host_performance", {}).get("memory_percent"),
                    "db_latency_ms": telemetry.get("database_telemetry", {}).get("latency_ms"),
                }
            }

    @classmethod
    async def stream_system_insights(
        cls,
        prompt: str,
        telemetry: Dict[str, Any],
        history: Optional[List[ChatMessage]] = None,
        category: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        Streams generated Gemini AI tokens in Server-Sent Events (SSE) format.
        Yields chunk by chunk: data: {"token": "...", "status": "generating"}\n\n
        And yields completion: data: {"status": "done", "full_answer": "...", ...}\n\n
        On failure or missing API key, smoothly streams grounded telemetry fallback analysis.
        """
        t0 = time.perf_counter()
        client = cls.get_client()
        model_name = getattr(settings, "GEMINI_MODEL", None) or "gemini-3.5-flash-lite"
        cat = category or telemetry.get("query_classification") or "COMPLEX"
        db_time = telemetry.get("db_query_time_ms", 0.0)

        # 1. Missing Key Fallback Streaming
        if not client:
            answer = cls.generate_grounded_fallback_analysis(prompt, telemetry)
            words = answer.split(" ")
            for i in range(0, len(words), 4):
                chunk = " ".join(words[i:i+4]) + " "
                yield f"data: {json.dumps({'token': chunk, 'status': 'generating'})}\n\n"
                await asyncio.sleep(0.015)
            done_payload = {
                "status": "done",
                "full_answer": answer,
                "model_used": "system-grounded-telemetry-engine",
                "category": cat,
                "db_query_time_ms": db_time,
                "gemini_latency_ms": 0.0,
                "total_duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                "has_api_key": False
            }
            yield f"data: {json.dumps(done_payload)}\n\n"
            return

        # 2. Prepare Context & Contents
        grounding_context = cls._build_grounding_context(prompt, telemetry, cat)

        try:
            from google.genai import types

            contents = []
            trimmed_history = (history or [])[-4:]
            for msg in trimmed_history:
                r = "user" if msg.role == "user" else "model"
                contents.append(types.Content(
                    role=r,
                    parts=[types.Part.from_text(text=msg.content)]
                ))

            contents.append(types.Content(
                role="user",
                parts=[types.Part.from_text(text=grounding_context)]
            ))

            candidate_models = []
            if model_name and model_name not in ["gemini-3.8-flash"]:
                candidate_models.append(model_name)
            for fallback_m in [
                "gemini-3.5-flash-lite",
                "gemini-3.5-flash",
                "gemini-3.1-flash-lite",
            ]:
                if fallback_m not in candidate_models:
                    candidate_models.append(fallback_m)

            stream_succeeded = False
            full_chunks: List[str] = []
            successful_model = candidate_models[0]
            last_error = None

            for m in candidate_models:
                try:
                    cfg_kwargs: Dict[str, Any] = {
                        "system_instruction": GEMINI_SYSTEM_INSTRUCTION,
                        "temperature": 0.2,
                        "max_output_tokens": 2048,
                    }
                    if cat in ["SIMPLE", "WORKFORCE"] and m in ["gemini-3.5-flash", "gemini-3.7-flash"]:
                        cfg_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)

                    config = types.GenerateContentConfig(**cfg_kwargs)

                    if hasattr(client, "aio") and hasattr(client.aio, "models"):
                        stream_call = client.aio.models.generate_content_stream(
                            model=m,
                            contents=contents,
                            config=config
                        )
                        if inspect.isawaitable(stream_call):
                            response_stream = await stream_call
                        else:
                            response_stream = stream_call
                    else:
                        response_stream = client.models.generate_content_stream(
                            model=m,
                            contents=contents,
                            config=config
                        )

                    model_chunks: List[str] = []
                    async for chunk in response_stream:
                        chunk_text = chunk.text or ""
                        if chunk_text:
                            model_chunks.append(chunk_text)
                            yield f"data: {json.dumps({'token': chunk_text, 'status': 'generating'})}\n\n"

                    full_chunks = model_chunks
                    successful_model = m
                    stream_succeeded = True
                    break
                except Exception as stream_err:
                    last_error = stream_err
                    logger.warning(f"Streaming candidate model {m} failed: {stream_err}. Trying next...")
                    continue

            if not stream_succeeded:
                raise last_error or RuntimeError("All Gemini streaming candidate models failed.")

            full_answer = "".join(full_chunks).strip()
            if not full_answer:
                full_answer = "Analysis completed, but no text output was generated."

            gemini_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            done_payload = {
                "status": "done",
                "full_answer": full_answer,
                "model_used": successful_model,
                "category": cat,
                "db_query_time_ms": db_time,
                "gemini_latency_ms": gemini_latency_ms,
                "total_duration_ms": round(db_time + gemini_latency_ms, 2),
                "has_api_key": True
            }
            yield f"data: {json.dumps(done_payload)}\n\n"

        except Exception as e:
            logger.error(f"Error during Gemini streaming: {e}", exc_info=True)
            error_str = str(e)
            notice_msg = "Temporary rate limit or connectivity issue encountered. Serving live database telemetry:"
            fallback_answer = (
                f"> [!WARNING]\n"
                f"> **Gemini Stream Fallback:** {notice_msg}\n\n"
                + cls.generate_grounded_fallback_analysis(prompt, telemetry, include_missing_key_note=False)
            )
            # Smoothly stream fallback chunks
            words = fallback_answer.split(" ")
            for i in range(0, len(words), 5):
                chunk = " ".join(words[i:i+5]) + " "
                yield f"data: {json.dumps({'token': chunk, 'status': 'generating'})}\n\n"
                await asyncio.sleep(0.01)

            done_payload = {
                "status": "done",
                "full_answer": fallback_answer,
                "model_used": "system-grounded-telemetry-engine",
                "category": cat,
                "db_query_time_ms": db_time,
                "gemini_latency_ms": round((time.perf_counter() - t0) * 1000, 2),
                "total_duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                "has_api_key": True
            }
            yield f"data: {json.dumps(done_payload)}\n\n"
