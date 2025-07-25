
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
    
    console.log("[generateCoreContent] Function execution started.");
    const requestTimestamp = new Date().toISOString();
    console.log(`[generateCoreContent] Request received at: ${requestTimestamp}`);

    try {
        console.log("[generateCoreContent] Initializing OpenAI client...");
        const apiKey = Deno.env.get("OPENAI_API_KEY");
        if (!apiKey) {
            console.error("[generateCoreContent] CRITICAL ERROR: OPENAI_API_KEY is missing.");
            // This specific error message should be clear if the API key is the issue.
            return new Response(JSON.stringify({ 
                error: 'Server configuration error: OPENAI_API_KEY is not set in backend function.',
                details: 'The OpenAI API key is missing in the server environment.' 
            }), {
                status: 500, 
                headers: { 
                    "Content-Type": "application/json",
                    'Access-Control-Allow-Origin': '*' 
                },
            });
        }
        const openaiClient = new OpenAI({ apiKey });
        console.log("[generateCoreContent] OpenAI client initialized.");

        console.log("[generateCoreContent] Parsing request body...");
        const { productDetails, languageHint } = await req.json();
        console.log(`[generateCoreContent] Parsed body - productDetails length: ${productDetails?.length || 0}, languageHint: ${languageHint}`);

        if (!productDetails) {
            console.error("[generateCoreContent] Missing productDetails in request body");
            return new Response(JSON.stringify({ error: 'Missing productDetails in request body' }), { 
                status: 400, 
                headers: { 
                    "Content-Type": "application/json",
                    'Access-Control-Allow-Origin': '*' 
                } 
            });
        }

        const detectedLanguage = languageHint || "עברית"; // Default to Hebrew if not specified

        const prompt = `
        אתה מומחה לאופטימיזציה של תוכן מוצרים לחנויות מקוונות. המשימה שלך היא לשפר תיאור מוצר קיים.
        
        תיאור המוצר המקורי:
        ${productDetails}

        שפת היעד לתוכן היא: ${detectedLanguage}. 

        **חשוב ביותר - הנחיות שפה נוקשות:**
        1. כל התוכן שתייצר (כותרת ותיאור) חייב להיות אך ורק ב${detectedLanguage}.
        2. אסור לחלוטין לערבב מילים משפות אחרות (כגון אנגלית) בתוך הטקסט.
        3. אם השפה היא עברית - השתמש רק במילים עבריות. אל תכתוב מילים כמו "ELEGANCE", "DESIGN", "PREMIUM", "MODERN", "STYLE" וכו' באנגלית.
        4. אם השפה היא ערבית - השתמש רק במילים ערביות.
        5. אם השפה היא אנגלית - השתמש רק במילים באנגלית.
        6. השתמש במילים מקומיות וטבעיות לשפה, לא בתרגומים מילוליים מאנגלית.
        7. אל תוסיף גרשיים סביב הטקסט המלא של הכותרת או התיאור ב-JSON.
        8. יוצאי דופן יחידים: שמות מותגים, דגמים או מונחים טכניים ספציפיים שאין להם תרגום מקובל.

        דוגמאות למה שאסור לעשות בעברית:
        - "אגרטל ELEGANT מזכוכית" ❌
        - "עיצוב PREMIUM לבית" ❌  
        - "סטייל MODERN ומינימליסטי" ❌
        - "זכוכית עם ELEGANCE מיוחדת" ❌

        דוגמאות נכונות בעברית:
        - "אגרטל אלגנטי מזכוכית" ✅
        - "עיצוב יוקרתי לבית" ✅
        - "סגנון מודרני ומינימליסטי" ✅
        - "זכוכית עם אלגנטיות מיוחדת" ✅

        אנא ספק את הרכיבים הבאים בפורמט JSON:
        1.  **optimized_content**: אובייקט המכיל:
            *   **optimized_title**: כותרת מוצר חדשה, קצרה (עד 70 תווים), מושכת ומותאמת למנועי חיפוש.
            *   **optimized_description**: תיאור מוצר משופר (100-200 מילים), ברור, משכנע, מדגיש יתרונות עיקריים, כתוב בשפה שיווקית וזורמת. התמקד בשיפור התיאור הקיים מבלי להוסיף מידע חדש שלא היה בו.
        2.  **user_search_queries**: מערך של 3-5 שאילתות חיפוש (מחרוזות) מגוונות ומציאותיות שלקוחות פוטנציאליים עשויים להקליד במנועי חיפוש כדי למצוא מוצר זה או דומה לו. כלול גם שאילתות "זנב ארוך".

        דוגמה לפורמט JSON המבוקש:
        {
          "optimized_content": {
            "optimized_title": "כותרת מוצר אופטימלית כאן",
            "optimized_description": "תיאור מוצר משופר ומפורט כאן..."
          },
          "user_search_queries": [
            "שאילתת חיפוש לדוגמה 1",
            "שאילתת חיפוש מפורטת יותר (זנב ארוך) 2",
            "ביטוי חיפוש רלוונטי נוסף 3"
          ]
        }

        זכור: הכל חייב להיות ב${detectedLanguage} בלבד! אל תערבב שפות!
        הקפד להחזיר JSON תקין בלבד, ווודא שכל התוכן הוא אך ורק ב${detectedLanguage} ללא ערבוב שפות, וללא גרשיים מיותרים סביב הטקסטים המלאים.
        `;

        console.log("[generateCoreContent] Sending request to OpenAI API...");
        const openAIRequestTimestamp = new Date().toISOString();
        // console.log("[generateCoreContent] Prompt (first 300 chars):", prompt.substring(0, 300) + "..."); // Reduce log noise for prompt

        const completion = await openaiClient.chat.completions.create({
            model: "gpt-4o-mini", 
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.6, 
        });
        const openAIResponseTimestamp = new Date().toISOString();
        console.log(`[generateCoreContent] OpenAI request sent at: ${openAIRequestTimestamp}, response received at: ${openAIResponseTimestamp}`);
        
        const responseText = completion.choices[0].message.content;
        // console.log("[generateCoreContent] OpenAI response text received (first 200 chars):", responseText?.substring(0,200)); // Reduce log noise
        
        let parsedData;
        try {
            parsedData = JSON.parse(responseText || '{}');
            console.log("[generateCoreContent] OpenAI response parsed successfully.");
        } catch (parseError) {
            console.error("[generateCoreContent] Failed to parse JSON from OpenAI:", parseError.message, "Response text:", responseText);
            return new Response(JSON.stringify({ 
                error: "Failed to parse AI response for core content.",
                details: `Parse Error: ${parseError.message}. Raw AI response: ${responseText ? responseText.substring(0, 200) + '...' : 'empty or null'}`,
                rawResponse: responseText 
            }), { 
                status: 500, 
                headers: { 
                    "Content-Type": "application/json",
                    'Access-Control-Allow-Origin': '*'
                } 
            });
        }
        
        const result = {
            optimized_content: parsedData.optimized_content || { 
                optimized_title: "שגיאה ביצירת כותרת", 
                optimized_description: "שגיאה ביצירת תיאור" 
            },
            user_search_queries: Array.isArray(parsedData.user_search_queries) ? parsedData.user_search_queries : []
        };

        if (!result.optimized_content.optimized_title) result.optimized_content.optimized_title = "כותרת לא נוצרה";
        if (!result.optimized_content.optimized_description) result.optimized_content.optimized_description = "תיאור לא נוצר";
        
        // console.log("[generateCoreContent] Final validated data ready to be sent:", JSON.stringify(result, null, 2).substring(0,300)); // Reduce log noise
        return new Response(JSON.stringify(result), {
            status: 200, 
            headers: { 
                "Content-Type": "application/json", 
                'Access-Control-Allow-Origin': '*' 
            },
        });

    } catch (error) {
        console.error("[generateCoreContent] Unexpected error in function execution:", error);
        let errorMessage = 'Internal server error in generateCoreContent.';
        let errorDetails = error.message;

        // Check if it's an OpenAI API error (response from OpenAI API endpoint)
        if (error.response && error.response.data) { 
            errorMessage = `OpenAI API Error: ${error.response.data.error?.message || error.message}`;
            errorDetails = JSON.stringify(error.response.data.error);
        } else if (error.status && error.message) { // For errors from OpenAI client itself (e.g. AuthenticationError, RateLimitError)
            errorMessage = `OpenAI Client Error (status ${error.status}): ${error.message}`;
            if (error.code) errorDetails += ` Code: ${error.code}`;
            if (error.type) errorDetails += ` Type: ${error.type}`;
        }
        
        return new Response(JSON.stringify({ 
            error: errorMessage, 
            details: errorDetails 
        }), {
            status: 500, 
            headers: { 
                "Content-Type": "application/json", 
                'Access-Control-Allow-Origin': '*' 
            },
        });
    } finally {
        console.log(`[generateCoreContent] Function execution finished at: ${new Date().toISOString()}`);
    }
});
