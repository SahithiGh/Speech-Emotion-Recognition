"""PDF and CSV export generation module for Speech Emotion Recognition analysis.

Generates:
1. Vectorized PDF report via ReportLab with conversation overview, speaker breakdown,
   emotion tracks/journey summaries, chronological transcript, and voice analysis.
2. Structured multi-CSV zip package with exact numerical model data and timestamps.
"""
from typing import Dict, Any, List
import io
import zipfile
import csv
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable


def generate_pdf_report(data: Dict[str, Any]) -> bytes:
    """Generate professional PDF report from analysis results."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40,
    )

    styles = getSampleStyleSheet()
    
    # Custom Brand Styles matching website typography
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#160709"),
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#5A4B4E"),
        spaceAfter=15,
    )
    h2_style = ParagraphStyle(
        "ReportH2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#C4536E"),
        spaceBefore=14,
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#160709"),
    )
    body_bold = ParagraphStyle(
        "ReportBodyBold",
        parent=body_style,
        fontName="Helvetica-Bold",
    )
    table_cell = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#160709"),
    )
    disclaimer_style = ParagraphStyle(
        "DisclaimerStyle",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#737373"),
    )

    story = []

    # Title & Header
    story.append(Paragraph("Speech Emotion Recognition - Analysis Report", title_style))
    story.append(Paragraph("Acoustic pattern inference & multi-speaker diarization report", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#E8E4D9"), spaceAfter=12))

    # Recording Information Overview Table
    created_at = data.get("created_at") or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    filename = data.get("original_filename", "Audio Recording")
    duration = data.get("analyzed_seconds") or data.get("duration", 0.0)
    spk_count = data.get("speaker_count", 1)
    dominant_emo = (data.get("predicted_emotion") or "neutral").capitalize()
    conf_pct = f"{round(float(data.get('confidence', 0.0)) * 100, 1)}%"

    meta_table_data = [
        [
            Paragraph("<b>Recording:</b>", body_style), Paragraph(str(filename), body_style),
            Paragraph("<b>Generated:</b>", body_style), Paragraph(str(created_at), body_style),
        ],
        [
            Paragraph("<b>Duration:</b>", body_style), Paragraph(f"{duration:.1f} seconds", body_style),
            Paragraph("<b>Speakers:</b>", body_style), Paragraph(str(spk_count), body_style),
        ],
        [
            Paragraph("<b>Dominant Emotion:</b>", body_style), Paragraph(f"<b>{dominant_emo}</b> ({conf_pct})", body_style),
            Paragraph("<b>Language:</b>", body_style), Paragraph(str(data.get("language_name") or data.get("language", "English")), body_style),
        ],
    ]
    meta_table = Table(meta_table_data, colWidths=[110, 155, 95, 170])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F7F5EE")),
        ("PADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8E4D9")),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 12))

    # Section 1: Detected Speakers Summary Table
    speakers = data.get("speakers", [])
    if speakers:
        story.append(Paragraph("1. Detected Speakers Breakdown", h2_style))
        spk_header = [
            Paragraph("<b>Speaker</b>", body_bold),
            Paragraph("<b>ID</b>", body_bold),
            Paragraph("<b>Speaking Time</b>", body_bold),
            Paragraph("<b>Turns</b>", body_bold),
            Paragraph("<b>Dominant Emotion</b>", body_bold),
            Paragraph("<b>Confidence</b>", body_bold),
        ]
        spk_rows = [spk_header]
        for spk in speakers:
            spk_rows.append([
                Paragraph(str(spk.get("name", "Unknown")), table_cell),
                Paragraph(str(spk.get("speaker_id", "-")), table_cell),
                Paragraph(f"{spk.get('speaking_seconds', 0):.1f}s ({spk.get('speaking_percentage', 0):.1f}%)", table_cell),
                Paragraph(str(spk.get("segment_count", 0)), table_cell),
                Paragraph(str(spk.get("dominant_emotion", "Neutral")).capitalize(), table_cell),
                Paragraph(f"{round(float(spk.get('confidence', 0.0)) * 100, 1)}%", table_cell),
            ])
        spk_table = Table(spk_rows, colWidths=[120, 60, 110, 50, 110, 80])
        spk_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF1F9")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8E4D9")),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(spk_table)
        story.append(Spacer(1, 10))

    # Section 2: Combined Chronological Transcript
    transcript = data.get("combined_transcript") or data.get("transcript_segments") or []
    if transcript:
        story.append(Paragraph("2. Combined Chronological Conversation Transcript", h2_style))
        t_header = [
            Paragraph("<b>Time</b>", body_bold),
            Paragraph("<b>Speaker</b>", body_bold),
            Paragraph("<b>Spoken Transcript</b>", body_bold),
            Paragraph("<b>Emotion</b>", body_bold),
        ]
        t_rows = [t_header]
        for item in transcript[:40]:   # Top 40 segments to prevent excessive page overflow
            st_val = float(item.get("start", 0.0))
            et_val = float(item.get("end", 0.0))
            spk_name = item.get("speaker_name") or item.get("speaker_id") or "Speaker"
            txt = item.get("text", "")
            emo = item.get("emotion") or "neutral"
            t_rows.append([
                Paragraph(f"{st_val:.1f}s - {et_val:.1f}s", table_cell),
                Paragraph(str(spk_name), table_cell),
                Paragraph(str(txt), table_cell),
                Paragraph(str(emo).capitalize(), table_cell),
            ])
        t_table = Table(t_rows, colWidths=[80, 85, 290, 75])
        t_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF1F9")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8E4D9")),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t_table)
        story.append(Spacer(1, 10))

    # Section 3: Advanced Voice Analysis
    voice = data.get("voice_analysis", {})
    if voice:
        story.append(Paragraph("3. Advanced Physical Voice Measurements", h2_style))
        p_info = voice.get("pitch", {})
        e_info = voice.get("energy", {})
        voice_data = [
            [
                Paragraph("<b>Mean Pitch (F0):</b>", body_style), Paragraph(f"{p_info.get('mean_hz', 0)} Hz", body_style),
                Paragraph("<b>Pitch Range:</b>", body_style), Paragraph(f"{p_info.get('min_hz', 0)} - {p_info.get('max_hz', 0)} Hz", body_style),
            ],
            [
                Paragraph("<b>Pitch Std Dev:</b>", body_style), Paragraph(f"{p_info.get('std_hz', 0)} Hz", body_style),
                Paragraph("<b>Voiced Speech Ratio:</b>", body_style), Paragraph(f"{p_info.get('voiced_percentage', 0)}%", body_style),
            ],
            [
                Paragraph("<b>Mean Vocal Energy:</b>", body_style), Paragraph(f"{e_info.get('mean_db', -60)} dB", body_style),
                Paragraph("<b>Energy Dynamic Range:</b>", body_style), Paragraph(f"{e_info.get('dynamic_range_db', 0)} dB", body_style),
            ],
        ]
        voice_table = Table(voice_data, colWidths=[130, 135, 130, 135])
        voice_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F7F5EE")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8E4D9")),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(voice_table)
        story.append(Spacer(1, 10))

    # Academic & Ethical Disclaimer
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#C5BFAF"), spaceAfter=8))
    disclaimer_text = (
        "Ethical & Academic Notice: Emotion predictions and vocal measurements represent physical acoustic model outputs "
        "trained on acted speech datasets. They are exploratory estimates and do not represent confirmed inner psychological "
        "truth, verified deception, or neurological state. Speaker diarization labels are recording-specific and do not identify "
        "real-world identity."
    )
    story.append(Paragraph(disclaimer_text, disclaimer_style))

    doc.build(story)
    return buf.getvalue()


def generate_csv_export(data: Dict[str, Any]) -> bytes:
    """Generate structured ZIP package containing 4 CSV export files."""
    zip_buf = io.BytesIO()

    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # 1. speakers_summary.csv
        spk_buf = io.StringIO()
        spk_writer = csv.writer(spk_buf)
        spk_writer.writerow([
            "speaker_id", "speaker_name", "speaking_seconds", "speaking_percentage",
            "segment_count", "dominant_emotion", "confidence",
            "mean_pitch_hz", "mean_energy_db"
        ])
        voice_metrics = data.get("voice_analysis", {}).get("speaker_metrics", {})
        for spk in data.get("speakers", []):
            sid = spk.get("speaker_id", "")
            vm = voice_metrics.get(sid, {})
            spk_writer.writerow([
                sid,
                spk.get("name", ""),
                spk.get("speaking_seconds", 0.0),
                spk.get("speaking_percentage", 0.0),
                spk.get("segment_count", 0),
                spk.get("dominant_emotion", ""),
                spk.get("confidence", 0.0),
                vm.get("mean_pitch_hz", ""),
                vm.get("mean_energy_db", ""),
            ])
        zf.writestr("speakers_summary.csv", spk_buf.getvalue())

        # 2. conversation_transcript.csv
        tr_buf = io.StringIO()
        tr_writer = csv.writer(tr_buf)
        tr_writer.writerow([
            "index", "start_seconds", "end_seconds", "speaker_id",
            "speaker_name", "text", "emotion", "confidence"
        ])
        for item in data.get("combined_transcript", []):
            tr_writer.writerow([
                item.get("index", 0),
                item.get("start", 0.0),
                item.get("end", 0.0),
                item.get("speaker_id", ""),
                item.get("speaker_name", ""),
                item.get("text", ""),
                item.get("emotion", ""),
                item.get("confidence", 0.0),
            ])
        zf.writestr("conversation_transcript.csv", tr_buf.getvalue())

        # 3. emotion_timeline.csv
        tl_buf = io.StringIO()
        tl_writer = csv.writer(tl_buf)
        tl_writer.writerow([
            "turn_index", "start_seconds", "end_seconds", "speaker_id",
            "speaker_name", "predicted_emotion", "top_score",
            "prob_happy", "prob_sad", "prob_angry", "prob_fear", "prob_disgust", "prob_neutral",
            "is_overlap", "is_uncertain"
        ])
        for turn in data.get("conversation_timeline", []):
            scores = turn.get("scores") or {}
            tl_writer.writerow([
                turn.get("turn_index", 0),
                turn.get("start", 0.0),
                turn.get("end", 0.0),
                turn.get("speaker_id", ""),
                turn.get("speaker_name", ""),
                turn.get("emotion", ""),
                turn.get("top_score", 0.0),
                scores.get("happy", 0.0),
                scores.get("sad", 0.0),
                scores.get("angry", 0.0),
                scores.get("fear", 0.0),
                scores.get("disgust", 0.0),
                scores.get("neutral", 0.0),
                turn.get("is_overlap", False),
                turn.get("is_uncertain", False),
            ])
        zf.writestr("emotion_timeline.csv", tl_buf.getvalue())

        # 4. voice_measurements.csv
        vm_buf = io.StringIO()
        vm_writer = csv.writer(vm_buf)
        vm_writer.writerow(["time_seconds", "pitch_hz", "vocal_energy_db"])
        p_ts = data.get("voice_analysis", {}).get("pitch", {}).get("time_series", [])
        e_ts = data.get("voice_analysis", {}).get("energy", {}).get("time_series", [])
        e_map = {item["time"]: item["energy_db"] for item in e_ts}
        for item in p_ts:
            t = item["time"]
            vm_writer.writerow([
                t,
                item.get("pitch_hz", ""),
                e_map.get(t, ""),
            ])
        zf.writestr("voice_measurements.csv", vm_buf.getvalue())

    return zip_buf.getvalue()

