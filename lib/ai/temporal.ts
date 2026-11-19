const MONTH_PATTERN = "january|february|march|april|may|june|july|august|september|october|november|december";

/**
 * Returns true only when the user's own text contains a real date expression.
 * This gates AI-proposed deadlines so a bare word like "deadline", "due" or
 * the ordinary verb "may" cannot unlock an invented date.
 */
export function hasTemporalCue(text: string): boolean {
  const relative =
    /\b(today|tomorrow|tonight|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|next\s+(?:day|week|month|year|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this\s+(?:week|month|year|weekend)|(?:in|within|after)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a\s+few|couple\s+of)\s+(?:day|week|month|year)s?|\d+\s+(?:day|week|month|year)s?\s+(?:from\s+now|later)|end\s+of\s+(?:the\s+)?(?:day|week|month|year)|\d{4}-\d{2}-\d{2}|\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\b/i;
  const months = new RegExp(
    `\\b(?:(?:${MONTH_PATTERN})\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTH_PATTERN})|(?:in|on|by|before|until|end\\s+of|this|next)\\s+(?:the\\s+)?(?:${MONTH_PATTERN}))\\b`,
    "i"
  );
  const southAsian = /(आज|कल|परसों|उद्या|परवा|तारीख|(?:इस|अगले|पुढील)\s+(?:हफ्ते|हप्ते|सप्ताह|महीने|महिन्या|महिन्यात))/;
  return relative.test(text) || months.test(text) || southAsian.test(text);
}
