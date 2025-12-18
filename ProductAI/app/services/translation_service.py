"""
Multi-Language Translation Service
Translate scripts while maintaining timing sync.
"""
import google.generativeai as genai
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import re

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash-lite")


# Supported languages
SUPPORTED_LANGUAGES: Dict[str, str] = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "ja": "Japanese",
    "zh": "Chinese (Simplified)",
    "pt": "Portuguese",
    "it": "Italian",
    "ko": "Korean",
    "hi": "Hindi"
}


class TranslationResult(BaseModel):
    """Translation result for a single language."""
    language_code: str
    language_name: str
    translated_text: str
    word_count: int
    estimated_duration_seconds: float
    success: bool = True
    error: Optional[str] = None


class MultiTranslationResult(BaseModel):
    """Complete multi-language translation result."""
    source_language: str
    source_language_name: str
    original_word_count: int
    translations: Dict[str, TranslationResult]
    detected_language: str
    confidence: float
    total_languages: int


def detect_language(text: str) -> Tuple[str, float]:
    """
    Detect the language of input text.
    
    Args:
        text: Text to analyze
        
    Returns:
        Tuple of (language_code, confidence)
    """
    if not text or not text.strip():
        return "en", 0.5
    
    # Take first 500 chars for detection
    sample = text[:500]
    
    prompt = f"""
Detect the language of this text and respond with ONLY two values separated by a comma:
1. The ISO 639-1 language code (lowercase, 2 letters)
2. Your confidence score (0.0 to 1.0)

Example response: en,0.98

Text to analyze:
{sample}

Response (format: code,confidence):
"""
    
    try:
        response = model.generate_content(prompt)
        result = response.text.strip()
        
        # Parse response
        parts = result.split(",")
        if len(parts) >= 2:
            lang_code = parts[0].strip().lower()[:2]
            confidence = float(parts[1].strip())
        else:
            # Try to extract just the language code
            lang_code = result.strip().lower()[:2]
            confidence = 0.7
        
        # Validate language code
        if lang_code not in SUPPORTED_LANGUAGES:
            # Default to English if not recognized
            return "en", 0.5
        
        return lang_code, min(1.0, max(0.0, confidence))
        
    except Exception as e:
        print(f"[Translation] Language detection error: {e}")
        return "en", 0.5


def translate_script(
    script: str,
    source_lang: str,
    target_lang: str
) -> TranslationResult:
    """
    Translate script to target language.
    
    Maintains timing-friendly structure (similar word count).
    
    Args:
        script: Original script text
        source_lang: Source language code
        target_lang: Target language code
        
    Returns:
        TranslationResult with translated text
    """
    if target_lang not in SUPPORTED_LANGUAGES:
        return TranslationResult(
            language_code=target_lang,
            language_name="Unknown",
            translated_text="",
            word_count=0,
            estimated_duration_seconds=0,
            success=False,
            error=f"Unsupported language: {target_lang}"
        )
    
    if source_lang == target_lang:
        word_count = len(script.split())
        return TranslationResult(
            language_code=target_lang,
            language_name=SUPPORTED_LANGUAGES[target_lang],
            translated_text=script,
            word_count=word_count,
            estimated_duration_seconds=word_count / 2.5,
            success=True
        )
    
    source_name = SUPPORTED_LANGUAGES.get(source_lang, "English")
    target_name = SUPPORTED_LANGUAGES[target_lang]
    
    prompt = f"""
Translate this product demo narration from {source_name} to {target_name}.

CRITICAL RULES:
1. Maintain similar length/word count for timing synchronization
2. Keep technical terms (button names, UI elements, brand names) in original if appropriate
3. Use natural, professional language in the target language
4. Preserve action verb structure (imperative tense)
5. Keep the same energy and enthusiasm
6. Output ONLY the translation, no explanations or notes
7. Do not add any text that wasn't in the original

Original {source_name} script:
{script}

{target_name} translation:
"""
    
    try:
        response = model.generate_content(prompt)
        translated = response.text.strip()
        
        # Clean up any markdown or formatting
        translated = re.sub(r'\*\*', '', translated)
        translated = re.sub(r'\*', '', translated)
        translated = translated.strip()
        
        word_count = len(translated.split())
        
        return TranslationResult(
            language_code=target_lang,
            language_name=target_name,
            translated_text=translated,
            word_count=word_count,
            estimated_duration_seconds=round(word_count / 2.5, 1),  # ~150 wpm
            success=True
        )
        
    except Exception as e:
        print(f"[Translation] Error translating to {target_lang}: {e}")
        return TranslationResult(
            language_code=target_lang,
            language_name=target_name,
            translated_text="",
            word_count=0,
            estimated_duration_seconds=0,
            success=False,
            error=str(e)
        )


def translate_to_multiple(
    script: str,
    target_languages: List[str],
    source_lang: Optional[str] = None
) -> MultiTranslationResult:
    """
    Translate script to multiple languages.
    
    Args:
        script: Original script text
        target_languages: List of target language codes
        source_lang: Source language (auto-detected if not provided)
        
    Returns:
        MultiTranslationResult with all translations
    """
    if not script or not script.strip():
        return MultiTranslationResult(
            source_language="en",
            source_language_name="English",
            original_word_count=0,
            translations={},
            detected_language="en",
            confidence=0.0,
            total_languages=0
        )
    
    # Detect source language if not provided
    if not source_lang:
        source_lang, confidence = detect_language(script)
    else:
        confidence = 1.0
    
    source_name = SUPPORTED_LANGUAGES.get(source_lang, "English")
    original_word_count = len(script.split())
    
    translations: Dict[str, TranslationResult] = {}
    
    for lang in target_languages:
        if lang == source_lang:
            continue
        
        if lang not in SUPPORTED_LANGUAGES:
            translations[lang] = TranslationResult(
                language_code=lang,
                language_name="Unknown",
                translated_text="",
                word_count=0,
                estimated_duration_seconds=0,
                success=False,
                error=f"Unsupported language: {lang}"
            )
            continue
        
        result = translate_script(script, source_lang, lang)
        translations[lang] = result
    
    return MultiTranslationResult(
        source_language=source_lang,
        source_language_name=source_name,
        original_word_count=original_word_count,
        translations=translations,
        detected_language=source_lang,
        confidence=round(confidence, 2),
        total_languages=len([t for t in translations.values() if t.success])
    )


def get_supported_languages() -> Dict[str, str]:
    """Get dict of supported language codes and names."""
    return SUPPORTED_LANGUAGES.copy()


def validate_language_code(code: str) -> bool:
    """Check if a language code is supported."""
    return code.lower() in SUPPORTED_LANGUAGES


def get_translation_response(
    script: str,
    target_languages: List[str],
    source_lang: Optional[str] = None
) -> Dict:
    """
    Get translation result as dictionary for API response.
    """
    result = translate_to_multiple(script, target_languages, source_lang)
    return result.dict()
