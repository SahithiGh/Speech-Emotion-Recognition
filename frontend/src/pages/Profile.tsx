import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  User as UserIcon,
  Mail,
  Calendar,
  LogOut,
  Trash2,
  ExternalLink,
  Edit2,
  Check,
  CheckCircle2,
  AlertTriangle,
  History,
  FileAudio,
  Sparkles,
  MessageSquare,
  Scale,
  ArrowLeftRight,
  Download,
} from "lucide-react";
import { useAuth, type SavedAnalysis } from "../auth";
import { exportPdfSaved, exportCsvSaved } from "../api";
import AnalysisComparison, { type ComparisonTarget } from "../components/AnalysisComparison";

export default function Profile() {
  const { user, loading, logout, updateProfile, deleteAccount, listAnalyses, deleteAnalysis } = useAuth();
  const navigate = useNavigate();

  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [updatingName, setUpdatingName] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [compareTargets, setCompareTargets] = useState<{ itemA: ComparisonTarget; itemB: ComparisonTarget } | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedForCompare((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 2
        ? [prev[1], id]
        : [...prev, id]
    );
  };

  const toComparisonTarget = (a: SavedAnalysis): ComparisonTarget => ({
    name: a.original_filename,
    analyzedSeconds: a.analyzed_seconds,
    result: {
      emotion: a.predicted_emotion,
      confidence: a.confidence,
      margin: a.margin,
      scores: a.scores,
      score_type: "normalized model scores",
      reliability: { available: true, validated_accuracy: a.confidence, samples: 100, score_range: [0.5, 1.0], uncertain: a.is_uncertain },
      analyzed_seconds: a.analyzed_seconds,
      processing_ms: 0,
      notes: a.notes || [],
      model: { id: a.model_id || null, name: a.model_name || "SVM", trained_at: null, language: "en", dataset: "CREMA-D" },
      speakers: a.speakers || [],
      conversation_timeline: a.conversation_timeline || [],
      emotion_tracks: a.emotion_tracks || {},
      emotion_journey: a.emotion_journey || [],
      voice_analysis: a.voice_analysis || {},
      speaker_count: a.speakers ? a.speakers.length : 1,
      transcription: a.transcript ? { text: a.transcript, engine: "faster-whisper", segments: a.transcript_segments || [] } : undefined,
      consistency: a.consistency_status ? {
        status: a.consistency_status as any,
        display_label: a.consistency_status === "consistent" ? "Broadly Consistent" : a.consistency_status === "divergent" ? "Mismatch Detected" : "Insufficient Evidence",
        explanation: a.consistency_explanation || "",
        text_affect: { polarity: "evaluated", detected_emotions: [], cues: [] }
      } : undefined
    }
  });

  const handleCompare = () => {
    if (selectedForCompare.length !== 2) return;
    const a = analyses.find((x) => x.id === selectedForCompare[0]);
    const b = analyses.find((x) => x.id === selectedForCompare[1]);
    if (!a || !b) return;
    setCompareTargets({
      itemA: toComparisonTarget(a),
      itemB: toComparisonTarget(b),
    });
  };

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true, state: { from: { pathname: "/profile" } } });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user?.full_name) {
      setNameVal(user.full_name);
    }
  }, [user?.full_name]);

  const userId = user?.id;
  useEffect(() => {
    if (userId) {
      loadHistory();
    }
  }, [userId, listAnalyses]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await listAnalyses();
      setAnalyses(data);
    } catch (err: any) {
      setError(err.message || "Failed to load saved analyses history.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameVal.trim()) return;
    setUpdatingName(true);
    setError(null);
    setMsg(null);
    try {
      await updateProfile(nameVal.trim());
      setEditingName(false);
      setMsg("Profile name updated successfully.");
    } catch (err: any) {
      setError(err.message || "Could not update profile.");
    } finally {
      setUpdatingName(false);
    }
  };

  const handleDeleteAnalysis = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this saved analysis?")) return;
    try {
      await deleteAnalysis(id);
      setAnalyses((prev) => prev.filter((a) => a.id !== id));
      setSelectedForCompare((prev) => prev.filter((x) => x !== id));
      setMsg("Saved analysis deleted successfully.");
    } catch (err: any) {
      setError(err.message || "Failed to delete analysis.");
    }
  };

  const handleReopen = (analysis: SavedAnalysis) => {
    // Navigate to /analyze with saved analysis data in state
    navigate("/analyze", { state: { reopenedAnalysis: analysis } });
  };

  const handleDeleteAccount = async () => {
    const confirmation = window.prompt(
      "Warning: Deleting your account will permanently remove your profile, sessions, and all saved analyses. Type DELETE to confirm:"
    );
    if (confirmation && confirmation.trim().toUpperCase() === "DELETE") {
      try {
        await deleteAccount();
        navigate("/", { replace: true });
      } catch (err: any) {
        setError(err.message || "Failed to delete account.");
      }
    } else if (confirmation !== null) {
      setError("Account deletion cancelled: confirmation text did not match 'DELETE'.");
    }
  };

  if (loading || !user) {
    return (
      <div className="profile-fullpage-view">
        <div className="profile-fullpage-video-bg">
          <video
            autoPlay
            loop
            muted
            playsInline
            poster="/media/cosmic-landscape-poster.webp"
            className="profile-fullpage-video"
            aria-hidden="true"
            tabIndex={-1}
          >
            <source src="/media/cosmic-landscape.mp4" type="video/mp4" />
          </video>
          <div className="profile-fullpage-overlay" />
        </div>
        <div className="wrap profile-content-container" style={{ textAlign: "center", padding: "8rem 1rem" }}>
          <p className="profile-header-subtitle">Loading your account details and analysis history...</p>
        </div>
      </div>
    );
  }

  const createdDate = new Date(user.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="profile-fullpage-view">
      {/* 1. Full-page background video spanning navbar to viewport bottom */}
      <div className="profile-fullpage-video-bg">
        <video
          autoPlay
          loop
          muted
          playsInline
          poster="/media/cosmic-landscape-poster.webp"
          className="profile-fullpage-video"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src="/media/cosmic-landscape.mp4" type="video/mp4" />
        </video>
        <div className="profile-fullpage-overlay" />
      </div>

      <div className="wrap profile-content-container">
        <div className="profile-page-header">
          <span className="profile-header-kicker">Account & Workspace</span>
          <h1 className="profile-header-title">User Profile</h1>
          <p className="profile-header-subtitle">
            Manage your account preferences, review past recordings, and revisit speech analysis history.
          </p>
        </div>

        {msg && (
          <div className="callout ok" role="status" style={{ marginBottom: "1.5rem" }}>
            <Check size={18} aria-hidden="true" />
            <span>{msg}</span>
          </div>
        )}
        {error && (
          <div className="callout warn" role="alert" style={{ marginBottom: "1.5rem" }}>
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="profile-grid">
          {/* Account Details Card */}
          <div className="card profile-card">
            <h2 className="card-title">
              <UserIcon size={20} className="icon-accent" /> Account Details
            </h2>

            <div className="profile-fields">
              <div className="profile-field">
                <span className="profile-field-label">
                  <UserIcon size={16} /> Full Name
                </span>
                {editingName ? (
                  <form onSubmit={handleUpdateName} className="inline-edit-form">
                    <input
                      type="text"
                      value={nameVal}
                      onChange={(e) => setNameVal(e.target.value)}
                      className="input-text sm"
                      required
                    />
                    <button type="submit" disabled={updatingName} className="btn primary sm">
                      <Check size={14} /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      className="btn sub sm"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="profile-field-val">
                    <strong>{user.full_name}</strong>
                    <button
                      className="icon-link-btn"
                      onClick={() => setEditingName(true)}
                      aria-label="Edit name"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="profile-field">
                <span className="profile-field-label">
                  <Mail size={16} /> Email Address
                </span>
                <span className="profile-field-val">{user.email}</span>
              </div>

              <div className="profile-field">
                <span className="profile-field-label">
                  <Calendar size={16} /> Member Since
                </span>
                <span className="profile-field-val">{createdDate}</span>
              </div>
            </div>

            <div className="profile-actions">
              <button onClick={() => logout()} className="btn sub block">
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </div>

          {/* Danger Zone Card */}
          <div className="card danger-card">
            <h2 className="card-title text-danger">
              <AlertTriangle size={20} /> Account Actions
            </h2>
            <p className="danger-text">
              Permanently delete your profile and erase all saved analyses from the database. This action cannot be undone.
            </p>
            <button onClick={handleDeleteAccount} className="btn danger block">
              <Trash2 size={16} /> Delete Account & Analyses
            </button>
          </div>
        </div>

        {/* Side-by-Side Comparison Panel */}
        {compareTargets && (
          <div style={{ marginBottom: "2rem" }}>
            <AnalysisComparison
              itemA={compareTargets.itemA}
              itemB={compareTargets.itemB}
              onClose={() => setCompareTargets(null)}
            />
          </div>
        )}

        {/* Saved Analyses History Section */}
        <section className="saved-history-section">
          <div className="section-header">
            <div>
              <h2 className="section-title">
                <History size={22} className="icon-accent" /> Saved Speech Analyses
              </h2>
              <p className="section-sub">
                Your personal, isolated history of speech recordings, vocal emotions, transcripts, and cross-modal consistency evaluations.
              </p>
            </div>
            <div className="card-actions-group">
              {analyses.length >= 2 && (
                <button
                  className="btn sub sm"
                  disabled={selectedForCompare.length !== 2}
                  onClick={handleCompare}
                  title="Select any two recordings to compare side-by-side"
                >
                  <ArrowLeftRight size={14} /> Compare Selected ({selectedForCompare.length}/2)
                </button>
              )}
              <Link to="/analyze" className="btn primary sm">
                <Sparkles size={16} /> Analyze New Audio
              </Link>
            </div>
          </div>

          {loadingHistory && analyses.length === 0 ? (
            <p className="muted-text">Loading saved analyses...</p>
          ) : analyses.length === 0 ? (
            <div className="empty-history-card">
              <FileAudio size={48} className="empty-icon" />
              <h3>No saved analyses yet</h3>
              <p>
                Analyze an audio file or microphone recording, then click "Save this analysis" to review it here anytime.
              </p>
              <Link to="/analyze" className="btn primary">
                Analyze Audio Now
              </Link>
            </div>
          ) : (
            <div className="analyses-table-wrap">
              <table className="analyses-table">
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}>Compare</th>
                    <th>Date & File</th>
                    <th>Vocal Emotion</th>
                    <th>Confidence</th>
                    <th>Transcript</th>
                    <th>Cross-Modal Agreement</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {analyses.map((item) => (
                    <tr
                      key={item.id}
                      className={`history-row ${
                        item.consistency_status === "divergent"
                          ? "mismatch-row"
                          : item.consistency_status === "consistent"
                          ? "match-row"
                          : ""
                      }`}
                    >
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedForCompare.includes(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          aria-label={`Select ${item.original_filename} for comparison`}
                        />
                      </td>
                      <td>
                        <div className="cell-file">
                          <strong className="filename">{item.original_filename}</strong>
                          <span className="timestamp">
                            {new Date(item.created_at).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                          <span className="duration-tag">{item.analyzed_seconds}s</span>
                        </div>
                      </td>
                      <td>
                        <span className={`emotion-badge ${item.predicted_emotion.toLowerCase()}`}>
                          {item.predicted_emotion}
                        </span>
                      </td>
                      <td>
                        <div className="cell-metric">
                          <span className="pct">{(item.confidence * 100).toFixed(1)}%</span>
                          <span className="sub-metric">margin: +{(item.margin * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-transcript">
                          {item.transcript ? (
                            <span className="transcript-snippet" title={item.transcript}>
                              <MessageSquare size={14} /> "{item.transcript}"
                            </span>
                          ) : (
                            <span className="transcript-none">No transcript</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="cell-consistency">
                          {item.consistency_status ? (
                            <span className={`consistency-badge ${item.consistency_status}`}>
                              {item.consistency_status === "divergent" && <AlertTriangle size={13} className="inline-icon" />}
                              {item.consistency_status === "consistent" && <CheckCircle2 size={13} className="inline-icon" />}
                              {item.consistency_status === "inconclusive" && <Scale size={13} className="inline-icon" />}
                              {" "}{item.consistency_status}
                            </span>
                          ) : (
                            <span className="muted-text">N/A</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="cell-actions" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <button
                            onClick={() => handleReopen(item)}
                            className="btn sub xs"
                            title="Open and inspect in Analyzer"
                          >
                            <ExternalLink size={13} /> Reopen
                          </button>
                          <button
                            onClick={() => {
                              const token = localStorage.getItem("ser_auth_token") || "";
                              exportPdfSaved(item.id, token);
                            }}
                            className="btn sub xs"
                            title="Export PDF Report"
                          >
                            <Download size={13} /> PDF
                          </button>
                          <button
                            onClick={() => {
                              const token = localStorage.getItem("ser_auth_token") || "";
                              exportCsvSaved(item.id, token);
                            }}
                            className="btn sub xs"
                            title="Export CSV Package"
                          >
                            <Download size={13} /> CSV
                          </button>
                          <button
                            onClick={() => handleDeleteAnalysis(item.id)}
                            className="icon-btn xs text-danger"
                            title="Delete this analysis"
                            aria-label="Delete analysis"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
