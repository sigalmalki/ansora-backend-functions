
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

    console.log("[refineDescriptionWithInsights] Function execution started.");
    const requestTimestamp = new Date().toISOString();
    console.log(`[refineDescriptionWithInsights] Request received at: ${requestTimestamp}`);

    try {
        console.log("[refineDescriptionWithInsights] Initializing OpenAI client...");
        const apiKey = Deno.env.get("OPENAI_API_KEY");
        if (!apiKey) {
            console.error("[refineDescriptionWithInsights] CRITICAL ERROR: OPENAI_API_KEY is missing.");
            return new Response(JSON.stringify({ error: 'Server configuration error: OPENAI_API_KEY is not set.' }), {
                status: 500, headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
            });
        }
        const openaiClient = new OpenAI({ apiKey });
        console.log("[refineDescriptionWithInsights] OpenAI client initialized.");

        console.log("[refineDescriptionWithInsights] Parsing request body...");
        const { 
            originalProductDetails, 
            initialOptimizedDescription, 
            stylisticInsights, 
            languageHint 
        } = await req.json();
        
        console.log(`[refineDescriptionWithInsights] Received data - originalProductDetails length: ${originalProductDetails?.length || 0}, initialOptimizedDescription length: ${initialOptimizedDescription?.length || 0}, languageHint: ${languageHint}`);

        if (!originalProductDetails || !initialOptimizedDescription || !stylisticInsights) {
            console.error("[refineDescriptionWithInsights] Missing required fields");
            return new Response(JSON.stringify({ error: 'Missing required fields: originalProductDetails, initialOptimizedDescription, or stylisticInsights' }), { 
                status: 400, headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' } 
            });
        }

        const detectedLanguage = languageHint || "עברית";
        
        // Create the insights summary for the prompt
        let insightsText = "";
        if (stylisticInsights.tone_and_style && stylisticInsights.tone_and_style.length > 0) {
            insightsText += `טון וסגנון לשוני: ${stylisticInsights.tone_and_style.join(", ")}\n`;
        }
        if (stylisticInsights.verbs_and_addressing && stylisticInsights.verbs_and_addressing.length > 0) {
            insightsText += `שימוש בפעלים וצורת פנייה: ${stylisticInsights.verbs_and_addressing.join(", ")}\n`;
        }
        if (stylisticInsights.benefit_and_advantage_phrases && stylisticInsights.benefit_and_advantage_phrases.length > 0) {
            insightsText += `ביטויי יתרון והטבה: ${stylisticInsights.benefit_and_advantage_phrases.join(", ")}\n`;
        }
        if (stylisticInsights.marketing_vocabulary && stylisticInsights.marketing_vocabulary.length > 0) {
            insightsText += `אוצר מילים שיווקי: ${stylisticInsights.marketing_vocabulary.join(", ")}\n`;
        }

        const prompt = `לפניך תיאור מקורי של מוצר ותיאור משופר ראשוני שלו:

תיאור המוצר המקורי:
"${originalProductDetails}"

תיאור משופר ראשוני:
"${initialOptimizedDescription}"

בנוסף, ריכזנו תובנות סגנוניות מתיאורים של מוצרים מתחרים:
${insightsText || "לא סופקו תובנות סגנוניות מפורטות."}

המשימה שלך:
שכתב את התיאור המשופר הראשוני כך שיהיה ברור, מושך, שיווקי ובעל טון עשיר יותר, תוך שימוש בהשראה הסגנונית מהתובנות לעיל (אם סופקו).

הנחיות חשובות ביותר:
1.  **שמור על השפה המקורית (${detectedLanguage})**: התיאור הסופי חייב להיות **אך ורק** ב${detectedLanguage}, ללא שום ערבוב מילים באנגלית או בשפות אחרות. אם ${detectedLanguage} היא עברית או ערבית, הימנע לחלוטין ממילים לועזיות.
2.  **אל תוסיף מידע חדש**: השתמש רק במידע שהופיע בתיאור המקורי.
3.  **השתמש בהשראה הסגנונית**: אם סופקו תובנות, שלב את הטון, הסגנון, צורת הפנייה והאוצר השיווקי מהן.
4.  **שמור על אותה אורך**: התיאור הסופי צריך להיות דומה באורכו לתיאור המשופר הראשוני.
5.  **אל תוסיף גרשיים**: החזר את התיאור הסופי כטקסט נקי, ללא גרשיים סביבו.

החזר **רק את התיאור הסופי המשופר כטקסט רגיל**, ללא הסברים נוספים, ללא תגיות JSON או כל דבר אחר.`;

        console.log("[refineDescriptionWithInsights] Sending request to OpenAI API...");
        const openAIRequestTimestamp = new Date().toISOString();

        const completion = await openaiClient.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7, // Slightly higher for more creative language while maintaining accuracy
        });
        
        const openAIResponseTimestamp = new Date().toISOString();
        console.log(`[refineDescriptionWithInsights] OpenAI request sent at: ${openAIRequestTimestamp}, response received at: ${openAIResponseTimestamp}`);
        
        const finalOptimizedDescription = completion.choices[0].message.content?.trim() || "שגיאה ביצירת תיאור מטויב סופי";
        // console.log("[refineDescriptionWithInsights] Final optimized description received (first 200 chars):", finalOptimizedDescription.substring(0, 200)); // Reduce log noise
        
        return new Response(JSON.stringify({ 
            finalOptimizedDescription: finalOptimizedDescription 
        }), {
            status: 200, 
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
        });

    } catch (error) {
        console.error("[refineDescriptionWithInsights] Unexpected error:", error.message, error.stack);
        let errorMessage = 'Internal server error in refineDescriptionWithInsights.';
        if (error.response && error.response.data) {
            errorMessage = `OpenAI API Error: ${error.response.data.error?.message || error.message}`;
        } else {
            errorMessage = error.message;
        }
        return new Response(JSON.stringify({ 
            error: 'Error in refineDescriptionWithInsights function.', 
            details: errorMessage 
        }), {
            status: 500, 
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
        });
    } finally {
        console.log(`[refineDescriptionWithInsights] Function execution finished at: ${new Date().toISOString()}`);
    }
});
