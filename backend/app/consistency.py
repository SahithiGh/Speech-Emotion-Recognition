"""Cross-modal consistency analyzer: evaluates acoustic vocal emotion against transcript wording.

Academic / Technical Principles:
1. Vocal Emotion: Inferred strictly from acoustic features (pitch, energy, spectral contours, embeddings).
2. Text Sentiment & Affect: Inferred from the transcript text using a lexical affect dictionary with negation and valence scoring.
3. Cross-modal Consistency: An estimate of agreement between vocal and lexical modalities.
4. Ethical Guardrails: Never claims deception, lying, sarcasm, or verified inner truth. A mismatch between vocal delivery
   and literal phrasing is not proof of dishonesty.
"""
from typing import Dict, Any, List, Optional
import re

# Curated affect dictionaries with polarity and emotion category cues
POSITIVE_WORDS = {
    "happy", "glad", "joy", "joyful", "delighted", "cheerful", "pleased", "great", "excellent", "wonderful",
    "fantastic", "amazing", "good", "love", "loving", "liked", "like", "favorite", "excited", "thrilled",
    "optimistic", "proud", "blessed", "grateful", "bright", "celebrate", "smile", "laugh", "laughter", "success",
    "win", "winner", "beautiful", "lovely", "peace", "peaceful", "calm", "hope", "hopeful", "satisfied", "content"
}

NEGATIVE_ANGER_WORDS = {
    "angry", "furious", "mad", "outraged", "enraged", "annoyed", "irritated", "frustrated", "hate", "hatred",
    "fuming", "hostile", "screaming", "ridiculous", "unacceptable", "terrible", "horrible", "infuriating"
}

NEGATIVE_SAD_WORDS = {
    "sad", "depressed", "unhappy", "sorrow", "grief", "gloomy", "crying", "miserable", "lonely", "hopeless",
    "disappointed", "heartbroken", "mourn", "hurt", "painful", "regret", "tragic", "loss", "tired", "broken"
}

NEGATIVE_FEAR_WORDS = {
    "afraid", "fear", "scared", "terrified", "panic", "panicked", "frightened", "nervous", "anxious", "worry",
    "worried", "dread", "alarmed", "threatened", "trembling", "danger", "horrified", "shaking", "chilling"
}

NEGATIVE_DISGUST_WORDS = {
    "disgust", "disgusted", "gross", "revolting", "nauseating", "vile", "sickening", "nasty", "foul", "repulsive",
    "loathe", "appalled", "awful", "offensive", "repugnant"
}

NEGATIONS = {"not", "never", "no", "neither", "nor", "hardly", "scarcely", "barely", "cannot", "can't", "won't", "don't", "didn't"}
INTENSIFIERS = {"very", "really", "extremely", "deeply", "immensely", "super", "absolutely", "so", "totally"}


def extract_tokens(text: str) -> List[str]:
    """Tokenize text into lowercase alpha words."""
    return [w.lower() for w in re.findall(r"\b[a-zA-Z']+\b", text)]


def analyze_text_affect(text: str) -> Dict[str, Any]:
    """Analyze lexical polarity, intensity, and detected affect cues from transcript."""
    tokens = extract_tokens(text)
    if not tokens:
        return {
            "polarity": "neutral",
            "pos_score": 0.0,
            "neg_score": 0.0,
            "detected_emotions": [],
            "cues": [],
            "word_count": 0,
        }

    pos_score = 0.0
    neg_score = 0.0
    detected_emotions = set()
    cues = []

    for i, word in enumerate(tokens):
        # Check if preceded by negation within 2 words
        negated = False
        for j in range(max(0, i - 2), i):
            if tokens[j] in NEGATIONS:
                negated = True
                break

        # Check intensifier
        weight = 1.5 if (i > 0 and tokens[i - 1] in INTENSIFIERS) else 1.0

        if word in POSITIVE_WORDS:
            if negated:
                neg_score += weight
                cues.append(f"not {word}")
                detected_emotions.add("sad")
            else:
                pos_score += weight
                cues.append(word)
                detected_emotions.add("happy")

        elif word in NEGATIVE_ANGER_WORDS:
            if negated:
                pos_score += 0.5 * weight
            else:
                neg_score += weight
                cues.append(word)
                detected_emotions.add("angry")

        elif word in NEGATIVE_SAD_WORDS:
            if negated:
                pos_score += 0.5 * weight
            else:
                neg_score += weight
                cues.append(word)
                detected_emotions.add("sad")

        elif word in NEGATIVE_FEAR_WORDS:
            if negated:
                pos_score += 0.5 * weight
            else:
                neg_score += weight
                cues.append(word)
                detected_emotions.add("fear")

        elif word in NEGATIVE_DISGUST_WORDS:
            if negated:
                pos_score += 0.5 * weight
            else:
                neg_score += weight
                cues.append(word)
                detected_emotions.add("disgust")

    total = pos_score + neg_score
    if total < 0.5:
        polarity = "neutral"
    elif pos_score > neg_score * 1.5:
        polarity = "positive"
    elif neg_score > pos_score * 1.5:
        polarity = "negative"
    else:
        polarity = "mixed"

    return {
        "polarity": polarity,
        "pos_score": round(pos_score, 2),
        "neg_score": round(neg_score, 2),
        "detected_emotions": sorted(list(detected_emotions)),
        "cues": cues[:6],
        "word_count": len(tokens),
    }


def analyze_cross_modal_consistency(
    transcript: Optional[str],
    predicted_emotion: str,
    confidence: float = 0.0,
    is_uncertain: bool = False,
) -> Dict[str, Any]:
    """Compare acoustic vocal emotion against transcript wording.

    Returns:
        status: "consistent" | "divergent" | "inconclusive"
        display_label: "Voice and wording appear broadly consistent." | "Voice and wording may differ." | "Insufficient evidence to compare."
        explanation: Clear, neutral description emphasizing modality comparison without claims of deception.
        text_affect: lexical analysis summary.
    """
    if not transcript or not transcript.strip() or is_uncertain:
        return {
            "status": "inconclusive",
            "display_label": "Insufficient Evidence",
            "explanation": "No transcript is available or vocal uncertainty is elevated. Both clear acoustic signals and reliable transcription are necessary for cross-modal comparison.",
            "text_affect": {"polarity": "unknown", "detected_emotions": [], "cues": []},
        }

    text_affect = analyze_text_affect(transcript)
    word_count = text_affect["word_count"]

    if word_count < 2:
        return {
            "status": "inconclusive",
            "display_label": "Insufficient Evidence",
            "explanation": "The spoken phrase is too short for reliable lexical sentiment evaluation.",
            "text_affect": text_affect,
        }

    vocal_emotion = (predicted_emotion or "").lower()
    text_polarity = text_affect["polarity"]
    detected_emotions = text_affect["detected_emotions"]

    # Category matching
    # Happy: positive valence
    # Angry, Disgust, Fear, Sad: negative valence with specific affect cues
    # Neutral: neutral valence

    is_vocal_positive = vocal_emotion == "happy"
    is_vocal_negative = vocal_emotion in {"angry", "disgust", "fear", "sad"}
    is_vocal_neutral = vocal_emotion == "neutral"

    # Evaluate agreement
    if is_vocal_positive:
        if text_polarity == "positive" or "happy" in detected_emotions:
            status = "consistent"
            display_label = "Broadly Consistent"
            explanation = "Acoustic cues exhibit positive vocal valence, aligning with the positive phrasing detected in the spoken words."
        elif text_polarity == "negative" and (text_affect["neg_score"] >= 1.5):
            status = "divergent"
            display_label = "Mismatch Detected"
            explanation = f"Vocal tone was classified as {vocal_emotion}, whereas the spoken transcript expresses negative lexical sentiment ({', '.join(text_affect['cues'])}). This reflects differences in delivery versus literal phrasing, not proof of deception."
        else:
            status = "inconclusive"
            display_label = "Insufficient Evidence"
            explanation = f"Vocal tone indicates {vocal_emotion}, but the spoken transcript is neutral or ambiguous in lexical affect."

    elif is_vocal_negative:
        if vocal_emotion in detected_emotions:
            status = "consistent"
            display_label = "Broadly Consistent"
            explanation = f"Both vocal acoustics and spoken phrasing convey {vocal_emotion}-related affect cues ({', '.join(text_affect['cues'])})."
        elif text_polarity == "negative":
            status = "consistent"
            display_label = "Broadly Consistent"
            explanation = f"Vocal tone was classified as {vocal_emotion} and the transcript contains negative lexical sentiment."
        elif text_polarity == "positive" and (text_affect["pos_score"] >= 1.5):
            status = "divergent"
            display_label = "Mismatch Detected"
            explanation = f"Vocal acoustics exhibit {vocal_emotion} characteristics, whereas the spoken transcript uses positive phrasing ({', '.join(text_affect['cues'])}). Note that vocal nuance and literal wording naturally diverge in irony, polite restraint, or varied delivery."
        else:
            status = "inconclusive"
            display_label = "Insufficient Evidence"
            explanation = f"Vocal tone was classified as {vocal_emotion}, but the spoken words contain neutral or conversational phrasing with minimal overt sentiment."

    elif is_vocal_neutral:
        if text_polarity == "neutral":
            status = "consistent"
            display_label = "Broadly Consistent"
            explanation = "Both vocal inflection and spoken phrasing maintain an even, neutral disposition."
        elif text_polarity in {"positive", "negative"} and (text_affect["pos_score"] >= 2.0 or text_affect["neg_score"] >= 2.0):
            status = "divergent"
            display_label = "Mismatch Detected"
            explanation = f"Acoustic delivery is neutral/uninflected, but the transcript contains strong {text_polarity} phrasing ({', '.join(text_affect['cues'])})."
        else:
            status = "inconclusive"
            display_label = "Insufficient Evidence"
            explanation = "Vocal tone is neutral, while the spoken text does not contain sufficiently strong affect markers to evaluate divergence."

    else:
        status = "inconclusive"
        display_label = "Insufficient Evidence"
        explanation = "Vocal prediction or transcript affect could not be matched with sufficient confidence."

    return {
        "status": status,
        "display_label": display_label,
        "explanation": explanation,
        "text_affect": text_affect,
    }
