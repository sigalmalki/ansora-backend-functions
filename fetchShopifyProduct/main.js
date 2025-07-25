
// Function to create realistic browser headers
const createBrowserHeaders = () => {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    ];

    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    return {
        'User-Agent': randomUserAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
    };
};

// Function to add random delay
const randomDelay = (min = 500, max = 1500) => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
};

// Retry function with exponential backoff
const fetchWithRetry = async (url, options, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[fetchShopifyProduct] Attempt ${attempt}/${maxRetries} for URL: ${url}`);

            if (attempt > 1) {
                // Add delay between retries with exponential backoff
                const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                console.log(`[fetchShopifyProduct] Waiting ${backoffDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }

            // Add random delay to seem more human-like
            await randomDelay();

            const response = await fetch(url, options);

            if (response.status === 429) {
                // Rate limited, wait longer and try again
                console.log(`[fetchShopifyProduct] Rate limited (429), waiting before retry...`);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    continue;
                }
            }

            if (response.status === 403) {
                console.log(`[fetchShopifyProduct] 403 Forbidden on attempt ${attempt}`);
                if (attempt < maxRetries) {
                    // Try with different headers on next attempt
                    options.headers = createBrowserHeaders();
                    continue;
                }
            }

            return response;

        } catch (error) {
            console.error(`[fetchShopifyProduct] Attempt ${attempt} failed:`, error.message);

            if (attempt === maxRetries) {
                throw error;
            }
        }
    }

    throw new Error('All retry attempts failed');
};

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

    try {
        console.log("[fetchShopifyProduct] Function started");

        const { productUrl } = await req.json();

        if (!productUrl) {
            console.error("[fetchShopifyProduct] Missing productUrl in request body");
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing productUrl in request body',
                details: 'A product URL is required to fetch product data.'
            }), {
                status: 400,
                headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Clean the URL and try to fetch JSON data
        let cleanUrl = productUrl.trim();

        // Remove any existing .json extension
        if (cleanUrl.endsWith('.json')) {
            cleanUrl = cleanUrl.slice(0, -5);
        }

        // Remove any query parameters for the JSON request
        const urlWithoutParams = cleanUrl.split('?')[0];
        const jsonUrl = `${urlWithoutParams}.json`;

        console.log(`[fetchShopifyProduct] Attempting to fetch Shopify product data from: ${jsonUrl}`);

        try {
            const response = await fetchWithRetry(jsonUrl, {
                headers: createBrowserHeaders(),
                signal: AbortSignal.timeout(15000) // Increased timeout to 15 seconds
            });

            const responseBody = await response.text();

            // Check if response is JSON before parsing
            let data;
            try {
                data = JSON.parse(responseBody);
            } catch (e) {
                 return new Response(JSON.stringify({
                    success: false,
                    error: "Invalid response from Shopify store",
                    details: "The store did not return valid JSON. It might be a regular HTML page."
                 }), {
                    status: 200,
                    headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' }
                });
            }

            if (!response.ok) {
                console.error(`[fetchShopifyProduct] Shopify fetch failed for ${jsonUrl}: ${response.status} ${response.statusText}`, responseBody);

                // Provide more specific error messages based on status code
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                let details = `Product JSON endpoint not accessible. Server responded with: ${response.status}`;

                if (response.status === 403) {
                    errorMessage = 'Access Forbidden - Store may have restricted product data access';
                    details = 'The Shopify store has blocked access to product JSON data. This may be due to store privacy settings or anti-bot protection.';
                } else if (response.status === 404) {
                    errorMessage = 'Product Not Found';
                    details = 'The product URL does not exist or the product may have been removed.';
                } else if (response.status === 429) {
                    errorMessage = 'Rate Limited';
                    details = 'Too many requests. The store is temporarily blocking requests.';
                }

                return new Response(JSON.stringify({
                    success: false,
                    error: errorMessage,
                    details: details
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' }
                });
            }

            if (data && data.product) {
                const product = data.product;

                console.log("[fetchShopifyProduct] Successfully fetched product data for:", product.title);
                return new Response(JSON.stringify({
                    success: true,
                    data: {
                        title: product.title || '',
                        description: product.body_html || product.description || '',
                        vendor: product.vendor || '',
                        product_type: product.product_type || '',
                        tags: product.tags || [],
                        handle: product.handle || '',
                        url: cleanUrl
                    }
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' }
                });
            } else {
                console.error(`[fetchShopifyProduct] Invalid product data structure from ${jsonUrl}:`, data);
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Invalid product data structure',
                    details: 'The JSON response from Shopify does not contain expected product information.'
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' }
                });
            }

        } catch (fetchError) {
            console.error(`[fetchShopifyProduct] Fetch error for ${jsonUrl}:`, fetchError);

            let errorMessage = 'Failed to fetch product data from Shopify URL';
            let details = fetchError.message || 'Network error or timeout occurred while fetching product data.';

            if (fetchError.message && fetchError.message.includes('timeout')) {
                errorMessage = 'Request Timeout';
                details = 'The request to fetch product data took too long and timed out.';
            }

            return new Response(JSON.stringify({
                success: false,
                error: errorMessage,
                details: details
            }), {
                status: 200,
                headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' }
            });
        }

    } catch (error) {
        console.error("[fetchShopifyProduct] Function error:", error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Internal server error',
            details: error.message
        }), {
            status: 500,
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' }
        });
    }
});
