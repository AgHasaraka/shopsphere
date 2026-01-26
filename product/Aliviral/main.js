/**
 * AliExpress Pro Analyzer - Main Logic
 */

// --- Global State ---
let currentProductData = null;

// --- Selectors ---
const elements = {
    aliLink: document.getElementById('aliLink'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    btnLoader: document.getElementById('btnLoader'),
    btnText: document.querySelector('.btn-text'),
    resultsSection: document.getElementById('resultsSection'),
    manualSection: document.getElementById('manualSection'),
    logs: document.getElementById('logs'),
    clearLogs: document.getElementById('clearLogs'),

    // Product Info
    productImage: document.getElementById('productImage'),
    productTitle: document.getElementById('productTitle'),
    currentPrice: document.getElementById('currentPrice'),
    originalPrice: document.getElementById('originalPrice'),
    discount: document.getElementById('discount'),
    rating: document.getElementById('rating'),
    reviews: document.getElementById('reviews'),
    productDesc: document.getElementById('productDesc'),
    mediaThumbnails: document.getElementById('mediaThumbnails'),
    mainImageContainer: document.getElementById('mainImageContainer'),

    // Viral Post
    viralPost: document.getElementById('viralPost'),
    hashtags: document.getElementById('hashtags'),
    regenerateBtn: document.getElementById('regenerateBtn'),
    copyAllBtn: document.getElementById('copyAllBtn'),

    // Manual Form
    manualForm: document.getElementById('manualForm'),
    cancelManual: document.getElementById('cancelManual'),

    // Modal
    previewModal: document.getElementById('previewModal'),
    modalMediaContainer: document.getElementById('modalMediaContainer'),
    closeModal: document.querySelector('.close-modal'),
    downloadMediaBtn: document.getElementById('downloadMediaBtn'),
    downloadAllBtn: document.getElementById('downloadAllBtn')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    log('System initialized. Ready for analysis.', 'system');
    setupEventListeners();
});

function setupEventListeners() {
    elements.analyzeBtn.addEventListener('click', handleAnalyze);
    elements.clearLogs.addEventListener('click', () => {
        elements.logs.innerHTML = '';
        log('Logs cleared.', 'system');
    });

    elements.copyAllBtn.addEventListener('click', copyAllToClipboard);
    elements.regenerateBtn.addEventListener('click', () => {
        if (currentProductData) generateViralContent(currentProductData);
    });

    elements.manualForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleManualSubmit();
    });

    elements.cancelManual.addEventListener('click', () => {
        elements.manualSection.style.display = 'none';
        log('Manual entry cancelled.', 'system');
    });

    // Modal Events
    elements.closeModal.addEventListener('click', () => {
        elements.previewModal.style.display = 'none';
        elements.modalMediaContainer.innerHTML = '';
    });

    window.addEventListener('click', (e) => {
        if (e.target === elements.previewModal) {
            elements.previewModal.style.display = 'none';
            elements.modalMediaContainer.innerHTML = '';
        }
    });

    elements.downloadMediaBtn.addEventListener('click', () => {
        const activeMedia = elements.modalMediaContainer.querySelector('img, video');
        if (activeMedia) {
            downloadMedia(activeMedia.src, activeMedia.tagName.toLowerCase());
        }
    });

    elements.mainImageContainer.addEventListener('click', () => {
        const src = elements.productImage.src;
        if (src) showPreview(src, 'img');
    });

    elements.downloadAllBtn.addEventListener('click', () => {
        if (currentProductData) downloadAllMedia(currentProductData);
    });
}

// --- Core Actions ---

async function handleAnalyze() {
    const url = elements.aliLink.value.trim();
    if (!url) {
        log('Please enter a valid AliExpress link.', 'error');
        return;
    }

    setLoading(true);
    elements.resultsSection.style.display = 'none';
    elements.manualSection.style.display = 'none';

    log(`Starting analysis for URL: ${url.substring(0, 40)}...`, 'info');

    try {
        log('Fetching HTML content...', 'info');
        const html = await fetchPageContent(url);

        log('Extracting product data...', 'info');
        const data = await extractDataFromHTML(html);

        if (!data || !data.name) {
            throw new Error('Incomplete data extracted.');
        }

        data.url = url; // Store original URL
        log('Extraction successful!', 'success');
        displayResults(data);
        generateViralContent(data);

    } catch (error) {
        log(`Auto-analysis failed: ${error.message}`, 'error');
        log('Switching to Manual Fallback...', 'system');
        showManualForm();
    } finally {
        setLoading(false);
    }
}

// --- Logic Helpers ---

async function fetchPageContent(url, isRetry = false) {
    // 1. Resolve shortened links (Multi-proxy)
    if (!isRetry && (url.includes('s.click.aliexpress.com') || url.includes('/e/_'))) {
        log('Detected shortened link. Resolving redirect...', 'info');

        const resolveProxies = [
            (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
            (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
        ];

        for (let proxy of resolveProxies) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s for resolution
                const response = await fetch(proxy(url), { signal: controller.signal });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    const html = data.contents || "";

                    const patterns = [
                        /window\.location\.href\s*=\s*["']([^"']+)["']/i,
                        /window\.location\s*=\s*["']([^"']+)["']/i,
                        /location\.replace\(["']([^"']+)["']\)/i,
                        /<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^;]*;\s*url=([^"']+)["']/i,
                        /https?:\/\/[^\/]*aliexpress\.com\/item\/\d+\.html[^\s"'<>]*/i,
                        /https?:\/\/[^\/]*aliexpress\.com\/item\/[^\s"'<>]+/i,
                        /"redirectUrl"\s*:\s*"([^"]+)"/i
                    ];

                    for (let pattern of patterns) {
                        const match = html.match(pattern);
                        if (match && match[1]) {
                            url = match[1].replace(/\\u002F/g, '/').replace(/\\/g, '').replace(/&amp;/g, '&');
                            if (!url.startsWith('http')) url = 'https:' + (url.startsWith('//') ? '' : '//') + url;
                            log(`Resolved to: ${url.substring(0, 50)}...`, 'success');
                            break;
                        } else if (match && match[0] && pattern.toString().includes('aliexpress')) {
                            url = match[0].replace(/&amp;/g, '&');
                            log(`Resolved to: ${url.substring(0, 50)}...`, 'success');
                            break;
                        }
                    }
                    if (url !== arguments[0]) break;
                }
            } catch (e) {
                log(`Resolution proxy failed: ${e.message}`, 'error');
            }
        }
    }

    // 2. Main Fetch Loop
    const proxies = [
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        (u) => `https://thingproxy.freeboard.io/fetch/${u}`
    ];

    for (let i = 0; i < proxies.length; i++) {
        const proxyUrl = proxies[i](url);
        log(`Fetching via ${['AllOrigins', 'CodeTabs', 'ThingProxy'][i]}...`, 'info');

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);
            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`Status ${response.status}`);
            let html = await response.text();

            // 3. Detect "Redirect Gateway" page and recursive fetch
            // Be very aggressive: if it's a small page and not a product page, try to follow ANY link
            const isProductPage = html.includes('itemprop="name"') || html.includes('product-title') || html.includes('og:title');

            if (html.length < 10000 && !isProductPage) {
                log(`DEBUG: Short response (${html.length} chars). Checking for redirects...`, 'info');

                // Log the full HTML for small responses so I can see it in user screenshots
                if (html.length < 3000) {
                    console.log("FULL HTML CONTENT:", html);
                    log(`LOGGED CONTENT TO BROWSER CONSOLE`, 'system');
                }

                const redirectMatch =
                    html.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) ||
                    html.match(/window\.location\s*=\s*["']([^"']+)["']/i) ||
                    html.match(/location\.href\s*=\s*["']([^"']+)["']/i) ||
                    html.match(/location\s*=\s*["']([^"']+)["']/i) ||
                    html.match(/location\.replace\(["']([^"']+)["']\)/i) ||
                    html.match(/url=([^"']+)["']/i) ||
                    html.match(/href=["'](https?:\/\/[^"']*aliexpress\.com\/item\/[^"']+)["']/i);

                if (redirectMatch && redirectMatch[1] && !isRetry) {
                    let nextUrl = redirectMatch[1].replace(/\\u002F/g, '/').replace(/\\/g, '').replace(/&amp;/g, '&');
                    if (nextUrl.startsWith('//')) nextUrl = 'https:' + nextUrl;
                    if (!nextUrl.startsWith('http')) nextUrl = 'https://www.aliexpress.com' + (nextUrl.startsWith('/') ? '' : '/') + nextUrl;

                    log(`Gateway detected! Following to: ${nextUrl.substring(0, 50)}...`, 'info');
                    return await fetchPageContent(nextUrl, true);
                }
            }

            if (html.length > 500) {
                log(`Success! Fetched ${html.length} chars.`, 'success');
                return html;
            }
            throw new Error('Content too short.');
        } catch (err) {
            log(`Proxy failed: ${err.message}`, 'error');
            if (i === proxies.length - 1) throw err;
        }
    }
}

async function extractDataFromHTML(html) {
    log('Analyzing HTML content...', 'info');

    const getMatch = (regex, string, index = 1) => {
        const match = string.match(regex);
        return match ? match[index] : null;
    };

    // 1. Title
    const title = getMatch(/<meta property="og:title" content="([^"]+)"/, html) ||
        getMatch(/<title>([^<]+)<\/title>/, html) ||
        getMatch(/<h1>([^<]+)<\/h1>/, html) ||
        "AliExpress Product";

    // 2. Main Image - Try multiple sources
    let mainImage = null;

    // Try og:image first
    const ogMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (ogMatch) {
        mainImage = ogMatch[1];
        log(`Found og:image: ${mainImage.substring(0, 50)}...`, 'info');
    }

    // Try twitter:image
    if (!mainImage) {
        const twitterMatch = html.match(/<meta name="twitter:image" content="([^"]+)"/);
        if (twitterMatch) {
            mainImage = twitterMatch[1];
            log(`Found twitter:image: ${mainImage.substring(0, 50)}...`, 'info');
        }
    }

    // Clean the main image URL
    if (mainImage) {
        if (mainImage.startsWith('//')) mainImage = 'https:' + mainImage;
        mainImage = mainImage.replace(/\\\//g, '/');
    }

    // 3. Find ALL image URLs in the HTML
    const allImages = [];

    // Very broad pattern - any alicdn URL
    const imgPattern = /['"](https?:\/\/[^'"]*alicdn\.com[^'"]*\.(?:jpg|jpeg|png|webp))['"]/gi;
    let match;
    while ((match = imgPattern.exec(html)) !== null) {
        let url = match[1].replace(/\\\//g, '/');
        // Remove resize suffixes
        url = url.split('.jpg_')[0] + '.jpg';
        if (url.includes('.png')) url = url.split('.png_')[0] + '.png';
        if (!allImages.includes(url) && url.length < 300) {
            allImages.push(url);
        }
    }

    // Also try protocol-relative
    const protoPattern = /['"]\/\/(ae[0-9]+\.alicdn\.com[^'"]+\.(?:jpg|jpeg|png|webp))['"]/gi;
    while ((match = protoPattern.exec(html)) !== null) {
        let url = 'https://' + match[1].replace(/\\\//g, '/');
        url = url.split('.jpg_')[0] + '.jpg';
        if (!allImages.includes(url) && url.length < 300) {
            allImages.push(url);
        }
    }

    log(`Total images found in HTML: ${allImages.length}`, 'info');

    // Filter to only product images (containing /kf/)
    const productImages = allImages.filter(url => url.includes('/kf/'));

    log(`Product images (with /kf/): ${productImages.length}`, 'info');

    // Use product images if found, otherwise all images
    let finalImages = productImages.length > 0 ? productImages : allImages;

    // Add main image at the start if we have it
    if (mainImage && !finalImages.includes(mainImage)) {
        finalImages.unshift(mainImage);
    }

    // Remove duplicates
    finalImages = [...new Set(finalImages)].slice(0, 30);

    // Log first image for debugging
    if (finalImages.length > 0) {
        log(`First image URL: ${finalImages[0]}`, 'success');
    } else {
        log('WARNING: No images found!', 'error');
        // Use a guaranteed working placeholder
        finalImages = ['https://placehold.co/400x400/1e293b/white?text=No+Image'];
    }

    // 4. Videos
    const videos = [];
    const videoMatches = html.match(/https?:\/\/[^"'\s]+\.mp4/gi) || [];
    videoMatches.forEach(url => {
        if (!videos.includes(url)) videos.push(url);
    });

    // 5. Description
    const description = getMatch(/<meta name="description" content="([^"]+)"/, html) ||
        getMatch(/<meta property="og:description" content="([^"]+)"/, html) ||
        "Product details available on AliExpress.";

    // 6. Price
    const currentPrice = getMatch(/"formatedAmount"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/"actPriceText"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/"minPrice"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/itemprop="price" content="([^"]+)"/, html) ||
        "$--.--";

    const originalPrice = getMatch(/"oldPriceText"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/"origPriceText"\s*:\s*"([^"]+)"/, html) || "";

    const discount = getMatch(/"discount"\s*:\s*"?(\d+)"?/, html) ||
        getMatch(/"discountRate"\s*:\s*"?(\d+)"?/, html) || "0";

    // 7. Rating & Reviews
    const rating = getMatch(/"averageStar"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/"starRating"\s*:\s*([\d.]+)/, html) || "4.8";
    const reviews = getMatch(/"totalValidNum"\s*:\s*(\d+)/, html) ||
        getMatch(/"totalFeedbackCount"\s*:\s*(\d+)/, html) || "120+";

    const cleanTitle = title.split('|')[0].replace(/AliExpress/i, '').replace(/ - /g, '').trim();

    currentProductData = {
        name: cleanTitle,
        currentPrice: currentPrice,
        originalPrice: originalPrice,
        discount: discount + "%",
        description: description.substring(0, 250),
        image: finalImages[0] || "https://placehold.co/400x400/1e293b/white?text=No+Image",
        images: finalImages,
        videos: videos,
        rating: rating,
        reviews: reviews,
        features: ["Global Shipping", "Top Rated", "Secure Payment", "Buyer Protection"]
    };

    return currentProductData;
}

function displayResults(data) {
    try {
        elements.resultsSection.style.display = 'grid';
        elements.resultsSection.scrollIntoView({ behavior: 'smooth' });

        // Text content
        elements.productTitle.innerText = data.name || "Unknown Product";
        elements.productTitle.classList.remove('skeleton-text');

        elements.currentPrice.innerText = data.currentPrice || "$--.--";
        elements.currentPrice.classList.remove('skeleton-text');

        elements.originalPrice.innerText = data.originalPrice || "";
        elements.originalPrice.classList.remove('skeleton-text');

        elements.discount.innerText = data.discount ? `${data.discount} OFF` : "Great Deal";
        elements.discount.classList.remove('skeleton-text');

        elements.rating.innerText = `⭐ ${data.rating || '4.8'}`;
        elements.reviews.innerText = `${data.reviews || '100+'} Reviews`;

        elements.productDesc.innerText = data.description || "No description.";
        elements.productDesc.classList.remove('skeleton-text');

        // Main image with CORS handling
        const imageUrl = data.image || "https://placehold.co/400x400/1e293b/white?text=No+Image";

        // Try to load the image, but handle CORS gracefully
        elements.productImage.src = imageUrl;
        elements.productImage.alt = "Product Image";
        elements.mainImageContainer.classList.remove('skeleton');

        // Make the image container clickable to open in new tab
        elements.mainImageContainer.style.cursor = 'pointer';
        elements.mainImageContainer.onclick = () => {
            window.open(imageUrl, '_blank');
        };

        // Show the image URL and view button
        let debugInfo = document.querySelector('.image-debug-info');
        if (!debugInfo) {
            debugInfo = document.createElement('div');
            debugInfo.className = 'image-debug-info';
            debugInfo.style.cssText = 'font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem; padding: 0.5rem; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);';
            elements.mainImageContainer.appendChild(debugInfo);
        }
        debugInfo.innerHTML = `
            <div style="margin-bottom: 0.5rem;">
                <strong>📷 Found ${data.images.length} image(s)</strong>
            </div>
            <div style="margin-bottom: 0.5rem; word-break: break-all;">
                Current: <a href="${imageUrl}" target="_blank" style="color: #8b5cf6; text-decoration: underline;">${imageUrl.substring(0, 50)}...</a>
            </div>
           <button onclick="window.open('${imageUrl}', '_blank')" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 8px; cursor: pointer; font-size: 0.75rem; font-weight: 600;">
                🔗 Open Image in New Tab
            </button>
        `;

        // Add image load handlers
        elements.productImage.onload = () => {
            log('✅ Main image loaded successfully!', 'success');
            debugInfo.style.display = 'none'; // Hide if image loads
        };

        elements.productImage.onerror = () => {
            log('❌ Image blocked by CORS/hotlinking protection', 'error');
            log('💡 Click the image or "Open Image" button to view', 'info');
            // Show a message instead
            elements.productImage.src = 'https://placehold.co/400x400/1e293b/white?text=Click+to+View+Image';
            debugInfo.style.display = 'block'; // Show the open button
        };

        // Thumbnails with better error handling
        elements.mediaThumbnails.innerHTML = '';

        const mediaList = [
            ...(data.videos || []).map(v => ({ url: v, type: 'video' })),
            ...(data.images || []).map(i => ({ url: i, type: 'image' }))
        ];

        log(`Rendering ${mediaList.length} thumbnails...`, 'info');

        mediaList.forEach((media, index) => {
            const thumb = document.createElement('div');
            thumb.className = `thumb ${media.type === 'video' ? 'video-thumb' : ''} ${index === 0 ? 'active' : ''}`;
            thumb.title = media.url; // Show full URL on hover

            const img = document.createElement('img');
            img.src = media.type === 'video' ? (data.image || 'https://placehold.co/100x100') : media.url;

            // Hide broken images
            img.onerror = () => {
                thumb.style.display = 'none';
                log(`Thumbnail ${index + 1} failed to load`, 'error');
            };

            img.onload = () => {
                log(`Thumbnail ${index + 1} loaded`, 'success');
            };

            thumb.appendChild(img);
            thumb.onclick = () => {
                document.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');

                if (media.type === 'image') {
                    elements.productImage.src = media.url;
                    debugInfo.innerHTML = `Image URL: <a href="${media.url}" target="_blank" style="color: #8b5cf6;">${media.url.substring(0, 60)}...</a>`;
                } else {
                    showPreview(media.url, 'video');
                }
            };

            elements.mediaThumbnails.appendChild(thumb);
        });

    } catch (err) {
        log(`Display Error: ${err.message}`, 'error');
        console.error(err);
    }
}

function showPreview(url, type) {
    elements.modalMediaContainer.innerHTML = '';
    let element;

    if (type === 'video') {
        element = document.createElement('video');
        element.src = url;
        element.controls = true;
        element.autoplay = true;
    } else {
        element = document.createElement('img');
        element.src = url;
    }

    elements.modalMediaContainer.appendChild(element);
    elements.previewModal.style.display = 'flex';
}

async function downloadMedia(url, type) {
    log(`Downloading ${type} asset...`, 'info');
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `aliexpress-product-${Date.now()}.${type === 'video' ? 'mp4' : 'jpg'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
        log('Download started!', 'success');
    } catch (error) {
        log('Download failed. Opening in new tab.', 'error');
        window.open(url, '_blank');
    }
}

async function downloadAllMedia(data) {
    const all = [
        ...(data.videos || []).map(v => ({ url: v, type: 'video' })),
        ...(data.images || []).map(i => ({ url: i, type: 'image' }))
    ];

    if (all.length === 0) return;

    log(`Downloading ${all.length} assets...`, 'info');

    for (let i = 0; i < all.length; i++) {
        log(`Processing ${i + 1}/${all.length}...`, 'system');
        await downloadMedia(all[i].url, all[i].type);
        await new Promise(r => setTimeout(r, 800));
    }

    log('Batch download complete!', 'success');
}

function generateViralContent(data) {
    log('Generating viral post...', 'info');

    elements.viralPost.classList.add('skeleton-text');

    setTimeout(() => {
        const discountText = parseInt(data.discount) > 10 ? `😱 ${data.discount} OFF!!` : "🔥 Best Price Today!";
        const productUrl = data.url || elements.aliLink.value.trim() || "[YOUR LINK HERE]";

        const posts = [
            `🔥 STOP SCROLLING! This "${data.name}" is a total game changer! 😱\n\nI just found this GEM on AliExpress. Normally ${data.originalPrice || 'priced much higher'}, but today it's ONLY ${data.currentPrice} (${discountText})\n\n✨ Why you need this:\n✅ ${data.features[0]}\n✅ ${data.features[1]}\n✅ ${data.features[2]}\n\nDon't miss out! 🚀\n\nCheck it out 👉 ${productUrl}`,
            `The secret is out! 🤫 This ${data.name} is a fraction of big brand prices but works BETTER.\n\nRated ${data.rating}/5 by happy customers. Grab yours for ${data.currentPrice} today! 💸\n\nCheck it out 👉 ${productUrl}`,
            `POV: You found the perfect ${data.name} on AliExpress for only ${data.currentPrice}! 😍\n\nBest deal ever. Quality is 10/10.\n\nCheck it out 👉 ${productUrl}`
        ];

        const selectedPost = posts[Math.floor(Math.random() * posts.length)];
        elements.viralPost.innerText = selectedPost;
        elements.viralPost.classList.remove('skeleton-text');

        const baseTags = ['#AliExpressFinds', '#ViralProducts', '#DiscountAlert', '#ShoppingOnline', '#MustHave'];
        const productTag = `#${data.name.split(' ')[0].replace(/[^a-zA-Z]/g, '')}`;
        const tags = [...new Set([productTag, ...baseTags])].slice(0, 6);

        elements.hashtags.innerHTML = tags.map(t => `<span class="hashtag">${t}</span>`).join('');

        log('Viral content generated!', 'success');
    }, 1500);
}

async function handleManualSubmit() {
    const sourceHtml = document.getElementById('m-source').value.trim();

    let data;
    if (sourceHtml) {
        log('Analyzing pasted HTML...', 'info');
        try {
            data = await extractDataFromHTML(sourceHtml);
        } catch (e) {
            log('Parse failed. Using manual fields.', 'error');
        }
    }

    if (!data) {
        data = {
            name: document.getElementById('m-title').value || 'Manual Product',
            currentPrice: document.getElementById('m-price').value || '$0.00',
            originalPrice: document.getElementById('m-oldPrice').value || '',
            discount: document.getElementById('m-discount').value || '0',
            description: document.getElementById('m-desc').value || 'Manual description.',
            image: document.getElementById('m-image').value || 'https://via.placeholder.com/400',
            images: [],
            videos: [],
            rating: 'N/A',
            reviews: '0',
            features: ['Premium Quality', 'Best Deal']
        };
    }

    elements.manualSection.style.display = 'none';
    displayResults(data);
    generateViralContent(data);
}

function showManualForm() {
    elements.manualSection.style.display = 'block';
    elements.manualSection.scrollIntoView({ behavior: 'smooth' });
}

// --- Utilities ---

function log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString([], { hour12: false });
    entry.innerHTML = `<span style="opacity: 0.5; font-size: 0.7rem;">[${time}]</span> ${message}`;
    elements.logs.appendChild(entry);
    elements.logs.scrollTop = elements.logs.scrollHeight;
}

function setLoading(isLoading) {
    if (isLoading) {
        elements.analyzeBtn.disabled = true;
        elements.btnLoader.style.display = 'block';
        elements.btnText.style.display = 'none';
    } else {
        elements.analyzeBtn.disabled = false;
        elements.btnLoader.style.display = 'none';
        elements.btnText.style.display = 'block';
    }
}

function copyAllToClipboard() {
    const text = `${elements.viralPost.innerText}\n\n${Array.from(elements.hashtags.querySelectorAll('.hashtag')).map(h => h.innerText).join(' ')}`;
    navigator.clipboard.writeText(text).then(() => {
        log('Content copied!', 'success');
        const btn = elements.copyAllBtn;
        const originalText = btn.innerText;
        btn.innerText = 'Copied! ✅';
        setTimeout(() => btn.innerText = originalText, 2000);
    });
}
