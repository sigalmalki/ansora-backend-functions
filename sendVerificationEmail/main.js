
Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*', // Allow any origin
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }

    console.log("sendVerificationEmail function started");
    
    try {
        // Get Resend API key from secrets
        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
        if (!RESEND_API_KEY) {
            console.error("CRITICAL: RESEND_API_KEY is not set on the server.");
            return new Response(JSON.stringify({ 
                error: 'Server configuration error: Email service is not configured.',
                details: 'RESEND_API_KEY environment variable is missing'
            }), {
                status: 500,
                headers: { 
                    "Content-Type": "application/json",
                    'Access-Control-Allow-Origin': '*'
                },
            });
        }

        // Parse request body
        let requestBody;
        try {
            requestBody = await req.json();
        } catch (parseError) {
            console.error("Failed to parse request JSON:", parseError);
            return new Response(JSON.stringify({ 
                error: 'Invalid JSON in request body',
                details: parseError.message 
            }), { 
                status: 400, 
                headers: { 
                    "Content-Type": "application/json",
                    'Access-Control-Allow-Origin': '*'
                } 
            });
        }

        const { to, subject, body } = requestBody;
        
        if (!to || !subject || !body) {
            console.error("Missing required fields:", { to: !!to, subject: !!subject, body: !!body });
            return new Response(JSON.stringify({ 
                error: 'Missing required fields: to, subject, body',
                received: { to: !!to, subject: !!subject, body: !!body }
            }), { 
                status: 400, 
                headers: { 
                    "Content-Type": "application/json",
                    'Access-Control-Allow-Origin': '*'
                } 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            console.error("Invalid email format:", to);
            return new Response(JSON.stringify({ 
                error: 'Invalid email format',
                details: `The email address "${to}" is not valid`
            }), { 
                status: 400, 
                headers: { 
                    "Content-Type": "application/json",
                    'Access-Control-Allow-Origin': '*'
                } 
            });
        }

        console.log(`Attempting to send email to: ${to}`);
        console.log(`Subject: ${subject}`);

        // Call Resend API to send the email
        const resendPayload = {
            from: 'Ansora <verification@ansora.tech>', // Using the correct domain ansora.tech
            to: [to],
            subject: subject,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #6366f1; margin: 0; font-size: 28px;">Ansora</h1>
                        <p style="color: #6b7280; margin: 5px 0 0 0;">AI-Powered Product Optimization</p>
                    </div>
                    <div style="background: #f9fafb; padding: 20px; border-radius: 8px; border-left: 4px solid #6366f1;">
                        ${body.replace(/\n/g, '<br>')}
                    </div>
                    <div style="text-align: center; margin-top: 30px; color: #9ca3af; font-size: 14px;">
                        <p>This email was sent from Ansora's verification system.</p>
                    </div>
                </div>
            `,
        };

        console.log("Sending request to Resend API...");

        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'User-Agent': 'Ansora-App/1.0'
            },
            body: JSON.stringify(resendPayload),
        });

        console.log(`Resend API response status: ${resendResponse.status}`);

        let responseData;
        try {
            responseData = await resendResponse.json();
            console.log("Resend API response data:", responseData);
        } catch (jsonError) {
            console.error("Failed to parse Resend response as JSON:", jsonError);
            const responseText = await resendResponse.text();
            console.error("Raw Resend response:", responseText);
            return new Response(JSON.stringify({ 
                error: 'Invalid response from email service',
                details: `Status: ${resendResponse.status}, Raw response: ${responseText}`
            }), {
                status: resendResponse.status >= 400 ? resendResponse.status : 500, // Use Resend's status if it's an error, otherwise 500
                headers: { 
                    "Content-Type": "application/json",
                    'Access-Control-Allow-Origin': '*'
                },
            });
        }
        
        console.log(`Email service response for ${to}. Status: ${resendResponse.status}.`);
        
        // Return Resend's response directly, including its status and body
        return new Response(JSON.stringify(responseData), {
            status: resendResponse.status,
            headers: {
                "Content-Type": "application/json",
                'Access-Control-Allow-Origin': '*'
            },
        });

    } catch (error) {
        console.error("Unexpected error in sendVerificationEmail function:", error);
        return new Response(JSON.stringify({ 
            error: 'Internal server error while sending email', 
            details: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: { 
                "Content-Type": "application/json",
                'Access-Control-Allow-Origin': '*'
            },
        });
    }
});
