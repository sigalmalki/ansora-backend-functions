
import OpenAI from 'npm:openai@^4.20.0';

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }

    console.log("[generateStylisticInsights] Function execution started.");
    const requestTimestamp = new Date().toISOString();
    console.log(`[generateStylisticInsights] Request received at: ${requestTimestamp}`);

    try {
        console.log("[generateStylisticInsights] Initializing OpenAI client...");
        const apiKey = Deno.env.get("OPENAI_API_KEY");
        if (!apiKey) {
            console.error("[generateStylisticInsights] CRITICAL ERROR: OPENAI_API_KEY is missing.");
            return new Response(JSON.stringify({ error: 'Server configuration error: OPENAI_API_KEY is not set.' }), {
                status: 500, headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
            });
        }
        const openaiClient = new OpenAI({ apiKey });
        console.log("[generateStylisticInsights] OpenAI client initialized.");

        console.log("[generateStylisticInsights] Parsing request body...");
        const { competitorsList, languageHint } = await req.json();

        console.log(`[generateStylisticInsights] Parsed body - competitorsList count: ${competitorsList?.length || 0}, languageHint: ${languageHint}`);

        if (!competitorsList || competitorsList.length === 0) {
            console.error("[generateStylisticInsights] Missing competitorsList for stylistic insights generation.");
            return new Response(JSON.stringify({ error: 'Missing competitorsList for stylistic insights generation.' }), {
                status: 400, headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' }
            });
        }

        let competitorsInfoForPrompt = "להלן פרטי המוצרים המתחרים:\n";
        competitorsList.forEach((comp, index) => {
            competitorsInfoForPrompt += `מתחרה ${index + 1}:\n`;
            competitorsInfoForPrompt += `שם: "${comp.product_name}"\n`;
            competitorsInfoForPrompt += `תיאור: "${comp.product_description}"\n\n`;
        });

        const prompt = `אתה מומחה באסטרטגיית תוכן לקומרס אלקטרוני.
המשימה שלך היא לנתח את המידע על מספר מוצרים מתחרים ולחלץ תובנות סגנוניות משותפות או בולטות.
${competitorsInfoForPrompt}
שפה לתובנות: ${languageHint || "עברית"}

התבסס **אך ורק על תיאורי המתחרים שסופקו לעיל**. אל תתייחס למוצר מקורי כלשהו שאינו מופיע ברשימת המתחרים.
ספק תובנות סגנוניות קולקטיביות (1-2 נקודות לכל קטגוריה, המשקפות מגמות או דוגמאות חזקות מהמתחרים):
- טון וסגנון לשוני (למשל: פורמלי, בלתי פורמלי, שובב, טכני)
- שימוש בפעלים וצורת פנייה (למשל: גוף פעיל, פנייה ישירה ללקוח)
- ביטויי יתרון והטבה (למשל: דרכים נפוצות להדגשת ערך)
- אוצר מילים שיווקי (למשל: מילות מפתח ספציפיות או שפה משכנעת בשימוש)

**ודא שהתובנות הן ב${languageHint || "עברית"} בלבד. הימנע לחלוטין ממילים משפות אחרות (כגון אנגלית) אם שפת היעד היא עברית או ערבית.**

החזר את התשובה אך ורק בפורמט JSON עם המבנה הבא:
{
  "stylistic_insights": {
    "tone_and_style": ["תובנה קולקטיבית 1", "תובנה קולקטיבית 2"],
    "verbs_and_addressing": ["תובנה קולקטיבית 1"],
    "benefit_and_advantage_phrases": ["תובנה קולקטיבית 1", "תובנה קולקטיבית 2"],
    "marketing_vocabulary": ["תובנה קולקטיבית 1"]
  }
}
אם לא נמצאו תובנות ספציפיות עבור קטגוריה, ספק מערך ריק עבור אותה קטגוריה.`;

        console.log("[generateStylisticInsights] Sending request to OpenAI API...");
        const openAIRequestTimestamp = new Date().toISOString();
        // console.log("[generateStylisticInsights] Prompt (first 300 chars):", prompt.substring(0, 300) + "..."); // Reduce log noise

        const completion = await openaiClient.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.5,
        });
        const openAIResponseTimestamp = new Date().toISOString();
        console.log(`[generateStylisticInsights] OpenAI request sent at: ${openAIRequestTimestamp}, response received at: ${openAIResponseTimestamp}`);

        const responseText = completion.choices[0].message.content;
        // console.log("[generateStylisticInsights] OpenAI response text received (first 200 chars):", responseText?.substring(0,200)); // Reduce log noise

        let parsedData;
        try {
            parsedData = JSON.parse(responseText || '{}');
            console.log("[generateStylisticInsights] OpenAI response parsed successfully.");
        } catch (parseError) {
            console.error("[generateStylisticInsights] Failed to parse JSON from OpenAI:", parseError.message, "Response text:", responseText);
            return new Response(JSON.stringify({
                error: "Failed to parse AI response for stylistic insights.",
                details: parseError.message,
                rawResponse: responseText
            }), { status: 500, headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' } });
        }

        console.log("[generateStylisticInsights] Validating response structure...");
        if (!parsedData.stylistic_insights || typeof parsedData.stylistic_insights !== 'object') {
            console.warn("[generateStylisticInsights] Missing or invalid stylistic_insights object from OpenAI. Initializing default empty structure.");
            parsedData.stylistic_insights = {};
        }

        const requiredKeys = ["tone_and_style", "verbs_and_addressing", "benefit_and_advantage_phrases", "marketing_vocabulary"];
        requiredKeys.forEach(key => {
            if (!Array.isArray(parsedData.stylistic_insights[key])) {
                console.warn(`[generateStylisticInsights] '${key}' was not an array. Correcting to empty array.`);
                parsedData.stylistic_insights[key] = [];
            }
            parsedData.stylistic_insights[key] = parsedData.stylistic_insights[key]
                .filter(item => typeof item === 'string' && item.trim().length > 0)
                .map(item => item.trim());
        });

        // console.log("[generateStylisticInsights] Final validated data ready to be sent."); // Reduce log noise
        return new Response(JSON.stringify(parsedData), {
            status: 200,
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
        });

    } catch (error) {
        console.error("[generateStylisticInsights] Unexpected error:", error.message, error.stack);
        return new Response(JSON.stringify({
            error: 'Internal server error in generateStylisticInsights.',
            details: error.message
        }), {
            status: 500,
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
        });
    } finally {
        console.log(`[generateStylisticInsights] Function execution finished at: ${new Date().toISOString()}`);
    }
});
