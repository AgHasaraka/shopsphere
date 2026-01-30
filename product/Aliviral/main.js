/**
 * AliExpress Pro Analyzer - Main Logic
 */

// --- Global State ---
let currentProductData = null;

const PLACEHOLDER_IMAGE = 'https://placehold.co/400x400/1e293b/white?text=No+Image';
const IMAGE_PROXY_BASE = 'https://images.weserv.nl/?url=';
const WORLD_POPULATION_LABEL = 'about 8.27 billion';
const WORLD_POPULATION_DATE = 'January 26, 2026';

function stripResizeSuffix(url) {
    const [base, ...queryParts] = url.split('?');
    const cleanedBase = base.replace(/(\.(?:jpe?g|png|webp))_.+$/i, '$1');
    const query = queryParts.length ? `?${queryParts.join('?')}` : '';
    return `${cleanedBase}${query}`;
}

function normalizeImageUrl(url) {
    if (!url) return null;
    let cleaned = url.trim().replace(/^['"]|['"]$/g, '');
    cleaned = cleaned.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
    if (cleaned.startsWith('//')) cleaned = `https:${cleaned}`;
    if (!/^https?:\/\//i.test(cleaned)) return null;
    return stripResizeSuffix(cleaned);
}

function isIgnoredImage(url) {
    return /no-image|default|placeholder|empty|logo|icon|sprite|favicon|error|avatar/i.test(url);
}

function addUniqueImage(list, url) {
    const normalized = normalizeImageUrl(url);
    if (!normalized || isIgnoredImage(normalized)) return;
    if (!list.includes(normalized)) list.push(normalized);
}

function isProxyUrl(url) {
    return typeof url === 'string' && url.startsWith(IMAGE_PROXY_BASE);
}

function getProxyUrl(url) {
    if (!url || isProxyUrl(url)) return url;
    const stripped = url.replace(/^https?:\/\//i, '');
    return `${IMAGE_PROXY_BASE}${encodeURIComponent(stripped)}`;
}

function setImageWithFallback(img, url, { onLoad, onFinalError } = {}) {
    const originalUrl = url || PLACEHOLDER_IMAGE;
    img.dataset.original = originalUrl;
    img.dataset.proxyTried = 'false';

    img.onload = () => {
        if (onLoad) onLoad();
    };

    img.onerror = () => {
        if (img.dataset.proxyTried === 'true' || isProxyUrl(originalUrl) || originalUrl === PLACEHOLDER_IMAGE) {
            if (onFinalError) onFinalError();
            return;
        }
        img.dataset.proxyTried = 'true';
        img.src = getProxyUrl(originalUrl);
    };

    img.src = originalUrl;
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

function getMetaContent(html, key) {
    const escaped = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const patterns = [
        new RegExp(`<meta[^>]*property=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
        new RegExp(`<meta[^>]*name=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
        new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${escaped}["'][^>]*>`, 'i'),
        new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${escaped}["'][^>]*>`, 'i')
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

function extractTextFromHtml(html, pattern) {
    const match = html.match(pattern);
    if (!match || !match[1]) return null;
    return decodeHtmlEntities(
        match[1]
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    );
}

function extractObjectLiteral(source, startIndex) {
    const start = source.indexOf('{', startIndex);
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = start; i < source.length; i++) {
        const char = source[i];

        if (inString) {
            if (char === '\\') {
                i += 1;
                continue;
            }
            if (char === stringChar) {
                inString = false;
            }
            continue;
        }

        if (char === '"' || char === "'") {
            inString = true;
            stringChar = char;
            continue;
        }

        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return source.slice(start, i + 1);
            }
        }
    }

    return null;
}

function parseLooseObject(text) {
    if (!text) return null;
    const parsed = safeJsonParse(text);
    if (parsed) return parsed;

    try {
        return Function(`"use strict"; return (${text});`)();
    } catch (error) {
        return null;
    }
}

function parsePriceFromUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        let pdpNpi = url.searchParams.get('pdp_npi');
        if (!pdpNpi) return null;
        try {
            pdpNpi = decodeURIComponent(pdpNpi);
        } catch (error) {
            // Keep original if decoding fails.
        }
        const parts = pdpNpi.split('!');
        const currencyIndex = parts.findIndex(part => /^[A-Z]{3}$/.test(part));
        if (currencyIndex === -1) return null;
        const numbers = [];
        for (let i = currencyIndex + 1; i < parts.length; i += 1) {
            const value = parseFloat(parts[i]);
            if (Number.isFinite(value)) {
                numbers.push(value);
                if (numbers.length >= 2) break;
            }
        }
        if (!numbers.length) return null;

        let original = numbers[0];
        let current = numbers.length > 1 ? numbers[1] : numbers[0];
        if (current > original) {
            [current, original] = [original, current];
        }

        return {
            currency: parts[currencyIndex],
            current,
            original
        };
    } catch (error) {
        return null;
    }
}

function extractRunParams(html) {
    const candidates = [
        'window.runParams',
        'runParams',
        'window.__AER_DATA__',
        '__AER_DATA__',
        'window._d_c_.DCData',
        '_d_c_.DCData',
        'window._d_c_',
        '_d_c_'
    ];

    for (const candidate of candidates) {
        const index = html.indexOf(candidate);
        if (index === -1) continue;
        const objectLiteral = extractObjectLiteral(html, index);
        if (!objectLiteral) continue;
        const parsed = parseLooseObject(objectLiteral);
        if (parsed) return parsed;
    }

    return null;
}

function getValueByPath(obj, path) {
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), obj);
}

function getFirstValueByPaths(obj, paths) {
    for (const path of paths) {
        const value = getValueByPath(obj, path);
        if (value !== null && value !== undefined && value !== '') {
            return value;
        }
    }
    return null;
}

function findProductInJsonLd(data) {
    if (!data) return null;
    if (Array.isArray(data)) {
        for (const item of data) {
            const found = findProductInJsonLd(item);
            if (found) return found;
        }
        return null;
    }

    if (data['@graph']) {
        return findProductInJsonLd(data['@graph']);
    }

    const type = data['@type'];
    if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) {
        return data;
    }

    for (const value of Object.values(data)) {
        if (value && typeof value === 'object') {
            const found = findProductInJsonLd(value);
            if (found) return found;
        }
    }
    return null;
}

function extractJsonLdData(html) {
    const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        const jsonText = match[1].trim();
        if (!jsonText) continue;
        const data = safeJsonParse(jsonText);
        const product = findProductInJsonLd(data);
        if (!product) continue;

        const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
        const images = Array.isArray(product.image) ? product.image : (product.image ? [product.image] : []);

        return {
            name: product.name || null,
            description: product.description || null,
            images,
            price: offers ? (offers.price || offers.lowPrice || offers.highPrice || (offers.priceSpecification ? offers.priceSpecification.price : null)) : null,
            currency: offers ? (offers.priceCurrency || null) : null
        };
    }

    return {
        name: null,
        description: null,
        images: [],
        price: null,
        currency: null
    };
}

function parsePriceNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isNaN(value) ? null : value;
    if (typeof value !== 'string') return null;
    const cleaned = value.replace(/[^0-9.,]/g, '');
    if (!cleaned) return null;
    const normalized = cleaned.replace(/,/g, '');
    const parsed = parseFloat(normalized);
    return Number.isNaN(parsed) ? null : parsed;
}

function formatPrice(value, currencySymbol, currencyCode) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'number') value = value.toString();
    if (typeof value !== 'string') return value;
    const hasCurrency = /[$€£¥]|[A-Z]{2,3}\b/.test(value);
    if (hasCurrency) return value;
    if (currencySymbol) return `${currencySymbol}${value}`;
    if (currencyCode) return `${currencyCode} ${value}`;
    return value;
}

function decodeHtmlEntities(value) {
    if (!value || typeof value !== 'string') return value;
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
}

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
    if (elements.postDuration) {
        elements.postDuration.addEventListener('change', () => {
            if (currentProductData) generateViralContent(currentProductData);
        });
    }

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
            const mediaUrl = activeMedia.dataset.original || activeMedia.src;
            downloadMedia(mediaUrl, activeMedia.tagName.toLowerCase());
        }
    });

    elements.mainImageContainer.addEventListener('click', () => {
        const src = elements.productImage.dataset.original || elements.productImage.src;
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
        const data = await extractDataFromHTML(html, url);

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

async function extractDataFromHTML(html, sourceUrl = '') {
    log('Analyzing HTML content...', 'info');

    const getMatch = (regex, string, index = 1) => {
        const match = string.match(regex);
        return match ? match[index] : null;
    };

    const runParams = extractRunParams(html);
    const runData = runParams && runParams.data ? runParams.data : runParams;
    const jsonLd = extractJsonLdData(html);

    const titleFromRunParams = runData ? getFirstValueByPaths(runData, [
        'titleModule.subject',
        'titleModule.title',
        'titleModule.productTitle',
        'productTitle',
        'productName',
        'title',
        'subject'
    ]) : null;

    // 1. Title
    const metaTitle = getMetaContent(html, 'og:title') || getMetaContent(html, 'twitter:title');
    const domTitle = extractTextFromHtml(html, /<h1[^>]*data-pl=["']product-title["'][^>]*>([\s\S]*?)<\/h1>/i) ||
        extractTextFromHtml(html, /<h1[^>]*class=["'][^"']*title--[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
        extractTextFromHtml(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const rawTitle = domTitle ||
        jsonLd.name ||
        titleFromRunParams ||
        metaTitle ||
        getMatch(/<title>([^<]+)<\/title>/, html) ||
        "AliExpress Product";

    // 2. Main Image - Try multiple sources
    let mainImage = null;

    // Try og:image first
    const ogImage = getMetaContent(html, 'og:image');
    const ogMatch = ogImage ? [null, ogImage] : null;
    if (ogMatch) {
        mainImage = ogMatch[1];
        log(`Found og:image: ${mainImage.substring(0, 50)}...`, 'info');
    }

    // Try twitter:image
    if (!mainImage) {
        const twitterImage = getMetaContent(html, 'twitter:image');
        const twitterMatch = twitterImage ? [null, twitterImage] : null;
        if (twitterMatch) {
            mainImage = twitterMatch[1];
            log(`Found twitter:image: ${mainImage.substring(0, 50)}...`, 'info');
        }
    }

    // Clean the main image URL
    if (mainImage) {
        if (mainImage.startsWith('//')) mainImage = `https:${mainImage}`;
        mainImage = mainImage.replace(/\\\//g, '/');
        mainImage = normalizeImageUrl(mainImage) || mainImage;
    }

    // 3. Find ALL image URLs in the HTML
    const allImages = [];

    if (jsonLd.images && jsonLd.images.length) {
        jsonLd.images.forEach(url => addUniqueImage(allImages, url));
    }

    if (runData) {
        const runImages = getFirstValueByPaths(runData, [
            'imageModule.imagePathList',
            'imageModule.images',
            'imageModule.imagePath',
            'imagePathList',
            'summImagePathList'
        ]);
        if (Array.isArray(runImages)) {
            runImages.forEach(url => addUniqueImage(allImages, url));
        } else if (typeof runImages === 'string') {
            addUniqueImage(allImages, runImages);
        }
    }

    // Known image lists in AliExpress JSON blobs
    const imagePathListRegex = /"imagePathList"\s*:\s*\[([^\]]+)\]/gi;
    let listMatch;
    while ((listMatch = imagePathListRegex.exec(html)) !== null) {
        const listChunk = listMatch[1];
        const urlMatches = listChunk.match(/"(https?:\/\/[^"]+|\/\/[^"]+)"/g) || [];
        urlMatches.forEach(raw => addUniqueImage(allImages, raw));
    }

    // Common image fields in product JSON
    const imageFieldRegex = /"(?:imageUrl|imagePath|skuImage)"\s*:\s*"([^"]+)"/gi;
    let fieldMatch;
    while ((fieldMatch = imageFieldRegex.exec(html)) !== null) {
        addUniqueImage(allImages, fieldMatch[1]);
    }

    // Very broad pattern - any alicdn URL
    const imgPattern = /['"](https?:[^'"]*alicdn\.com[^'"]*\.(?:jpg|jpeg|png|webp)[^'"]*)['"]/gi;
    let match;
    while ((match = imgPattern.exec(html)) !== null) {
        addUniqueImage(allImages, match[1]);
    }

    // Also try protocol-relative
    const protoPattern = /['"]\/\/(ae[0-9]+\.alicdn\.com[^'"]+\.(?:jpg|jpeg|png|webp)[^'"]*)['"]/gi;
    while ((match = protoPattern.exec(html)) !== null) {
        addUniqueImage(allImages, `https://${match[1]}`);
    }

    log(`Total images found in HTML: ${allImages.length}`, 'info');

    const finalImages = [];
    addUniqueImage(finalImages, mainImage);
    allImages.forEach(url => addUniqueImage(finalImages, url));

    // Log first image for debugging
    if (finalImages.length > 0) {
        log(`First image URL: ${finalImages[0]}`, 'success');
    } else {
        log('WARNING: No images found!', 'error');
        // Use a guaranteed working placeholder
        finalImages.push(PLACEHOLDER_IMAGE);
    }

    // 4. Videos
    const videos = [];
    const videoMatches = html.match(/https?:\/\/[^"'\s]+\.mp4/gi) || [];
    videoMatches.forEach(url => {
        if (!videos.includes(url)) videos.push(url);
    });

    // 5. Description
    const description = jsonLd.description ||
        getMetaContent(html, 'description') ||
        getMetaContent(html, 'og:description') ||
        "Product details available on AliExpress.";

    // 6. Price
    const domCurrentPrice = extractTextFromHtml(html, /<span[^>]*price-default--current[^>]*>([\s\S]*?)<\/span>/i) ||
        extractTextFromHtml(html, /<span[^>]*price--current[^>]*>([\s\S]*?)<\/span>/i);
    const domOriginalPrice = extractTextFromHtml(html, /<span[^>]*price-default--original[^>]*>([\s\S]*?)<\/span>/i);

    const currencySymbol = runData ? getFirstValueByPaths(runData, [
        'priceModule.currencySymbol',
        'priceModule.currency',
        'priceModule.currencyCode'
    ]) : null;

    const currencyCode = runData ? getFirstValueByPaths(runData, [
        'priceModule.currencyCode',
        'priceModule.currency'
    ]) : (jsonLd.currency || getMetaContent(html, 'product:price:currency') || getMetaContent(html, 'og:price:currency'));

    let currentPrice = (runData ? getFirstValueByPaths(runData, [
        'priceModule.formatedPrice',
        'priceModule.formatedAmount',
        'priceModule.minActivityAmount',
        'priceModule.minAmount',
        'priceModule.minPrice',
        'priceModule.skuPrice',
        'priceModule.price',
        'skuModule.skuPrice',
        'skuModule.price'
    ]) : null) ||
        domCurrentPrice ||
        jsonLd.price ||
        getMetaContent(html, 'product:price:amount') ||
        getMetaContent(html, 'og:price:amount') ||
        getMatch(/"formatedPrice"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/"formatedAmount"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/"actPriceText"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/"salePrice"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/"skuPrice"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/"minPrice"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/itemprop="price" content="([^"]+)"/, html) ||
        "";

    let originalPrice = (runData ? getFirstValueByPaths(runData, [
        'priceModule.originalPrice',
        'priceModule.oldPrice',
        'priceModule.origPrice',
        'priceModule.linePrice',
        'priceModule.maxPrice'
    ]) : null) ||
        domOriginalPrice ||
        getMetaContent(html, 'product:original_price:amount') ||
        getMatch(/"oldPriceText"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/"origPriceText"\s*:\s*"([^"]+)"/, html) || "";

    let discount = getMatch(/"discount"\s*:\s*"?(\d+)"?/, html) ||
        getMatch(/"discountRate"\s*:\s*"?(\d+)"?/, html) || "";

    if (currentPrice) {
        currentPrice = formatPrice(currentPrice, currencySymbol, currencyCode);
    }

    if (originalPrice) {
        originalPrice = formatPrice(originalPrice, currencySymbol, currencyCode);
    }

    if (!currentPrice) {
        const urlPrice = sourceUrl ? parsePriceFromUrl(sourceUrl) : null;
        if (urlPrice && Number.isFinite(urlPrice.current)) {
            currentPrice = formatPrice(urlPrice.current.toFixed(2), null, urlPrice.currency);
            if (!originalPrice && Number.isFinite(urlPrice.original)) {
                originalPrice = formatPrice(urlPrice.original.toFixed(2), null, urlPrice.currency);
            }
        } else {
            currentPrice = "$--.--";
        }
    }

    if ((!originalPrice || originalPrice === currentPrice) && sourceUrl) {
        const urlPrice = parsePriceFromUrl(sourceUrl);
        if (urlPrice && Number.isFinite(urlPrice.original)) {
            originalPrice = formatPrice(urlPrice.original.toFixed(2), null, urlPrice.currency);
        }
    }

    if (!discount && originalPrice && currentPrice) {
        const currentValue = parsePriceNumber(currentPrice);
        const originalValue = parsePriceNumber(originalPrice);
        if (currentValue && originalValue && originalValue > currentValue) {
            const computed = Math.round(((originalValue - currentValue) / originalValue) * 100);
            discount = `${computed}`;
        }
    }

    if (!discount) {
        discount = "0";
    }

    // 7. Rating & Reviews
    const rating = getMatch(/"averageStar"\s*:\s*"([^"]+)"/, html) ||
        getMatch(/"starRating"\s*:\s*([\d.]+)/, html) || "4.8";
    const reviews = getMatch(/"totalValidNum"\s*:\s*(\d+)/, html) ||
        getMatch(/"totalFeedbackCount"\s*:\s*(\d+)/, html) || "120+";

    const cleanTitle = domTitle
        ? domTitle.trim()
        : decodeHtmlEntities(rawTitle)
            .replace(/\s*\|\s*AliExpress.*$/i, '')
            .replace(/\s*-\s*AliExpress.*$/i, '')
            .replace(/\s*AliExpress\s*$/i, '')
            .trim();

    currentProductData = {
        name: cleanTitle,
        currentPrice: currentPrice,
        originalPrice: originalPrice,
        discount: discount + "%",
        description: description.substring(0, 250),
        image: finalImages[0] || PLACEHOLDER_IMAGE,
        images: finalImages,
        videos: videos,
        rating: rating,
        reviews: reviews,
        features: ["Global Shipping", "Top Rated", "Secure Payment", "Buyer Protection"]
    };

    return currentProductData;
}

function updateImageDebugInfo(imageUrl, totalImages) {
    let debugInfo = document.querySelector('.image-debug-info');
    if (!debugInfo) {
        debugInfo = document.createElement('div');
        debugInfo.className = 'image-debug-info';
        debugInfo.style.cssText = 'font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem; padding: 0.5rem; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);';
        elements.mainImageContainer.appendChild(debugInfo);
    }

    const safeUrl = imageUrl || PLACEHOLDER_IMAGE;
    debugInfo.innerHTML = `
        <div style="margin-bottom: 0.5rem;">
            <strong>Found ${totalImages} image(s)</strong>
        </div>
        <div style="margin-bottom: 0.5rem; word-break: break-all;">
            Current: <a href="${safeUrl}" target="_blank" rel="noopener" style="color: #8b5cf6; text-decoration: underline;">${safeUrl.substring(0, 60)}...</a>
        </div>
        <button type="button" class="image-debug-btn" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 8px; cursor: pointer; font-size: 0.75rem; font-weight: 600;">
            Open Image in New Tab
        </button>
    `;

    const debugButton = debugInfo.querySelector('.image-debug-btn');
    if (debugButton) {
        debugButton.addEventListener('click', () => window.open(safeUrl, '_blank'));
    }

    return debugInfo;
}

function setMainImage(imageUrl, totalImages) {
    const resolvedUrl = imageUrl || PLACEHOLDER_IMAGE;
    const debugInfo = updateImageDebugInfo(resolvedUrl, totalImages);
    let forceDebugVisible = false;

    setImageWithFallback(elements.productImage, resolvedUrl, {
        onLoad: () => {
            log('Main image loaded successfully!', 'success');
            if (!forceDebugVisible && debugInfo) debugInfo.style.display = 'none';
        },
        onFinalError: () => {
            forceDebugVisible = true;
            log('Image blocked by hotlinking protection', 'error');
            log('Click the image or "Open Image" button to view', 'info');
            if (debugInfo) debugInfo.style.display = 'block';
            if (elements.productImage.src !== PLACEHOLDER_IMAGE) {
                elements.productImage.src = PLACEHOLDER_IMAGE;
            }
        }
    });
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

        // Main image with fallback handling
        const imageUrl = data.image || PLACEHOLDER_IMAGE;

        elements.productImage.alt = "Product Image";
        elements.mainImageContainer.classList.remove('skeleton');
        elements.mainImageContainer.style.cursor = 'pointer';
        setMainImage(imageUrl, (data.images || []).length);

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
            const thumbUrl = media.type === 'video' ? (data.image || PLACEHOLDER_IMAGE) : media.url;

            setImageWithFallback(img, thumbUrl, {
                onLoad: () => {
                    if (img.naturalWidth < 15 || img.naturalHeight < 15) {
                        thumb.style.display = 'none';
                        return;
                    }
                    log(`Thumbnail ${index + 1} loaded`, 'success');
                },
                onFinalError: () => {
                    thumb.style.display = 'none';
                    log(`Thumbnail ${index + 1} failed to load`, 'error');
                }
            });

            thumb.appendChild(img);
            thumb.onclick = () => {
                elements.mediaThumbnails.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');

                if (media.type === 'image') {
                    setMainImage(media.url, (data.images || []).length);
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
        element.dataset.original = url;
    } else {
        element = document.createElement('img');
        setImageWithFallback(element, url, {
            onFinalError: () => {
                if (element.src !== PLACEHOLDER_IMAGE) {
                    element.src = PLACEHOLDER_IMAGE;
                }
            }
        });
    }

    elements.modalMediaContainer.appendChild(element);
    elements.previewModal.style.display = 'flex';
}

async function downloadMedia(url, type, usedProxy = false) {
    const targetUrl = url || (type === 'image' ? PLACEHOLDER_IMAGE : url);
    log(`Downloading ${type} asset...`, 'info');
    try {
        const response = await fetch(targetUrl);
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
        if (type === 'image' && !usedProxy && !isProxyUrl(targetUrl)) {
            log('Direct download failed. Retrying via proxy...', 'info');
            return downloadMedia(getProxyUrl(targetUrl), type, true);
        }
        log('Download failed. Opening in new tab.', 'error');
        window.open(targetUrl, '_blank');
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

// --- Elements Extension ---
elements.postDuration = document.getElementById('postDuration');
elements.regenLoader = document.getElementById('regenLoader');
elements.regenText = document.querySelector('.btn-icon-text');

let isGenerating = false;

function generateViralContent(data) {
    if (isGenerating) return;
    isGenerating = true;

    log('AI is analyzing trends for viral post...', 'info');

    // UI Feedback
    elements.viralPost.classList.add('skeleton-text');
    if (elements.regenLoader) elements.regenLoader.style.display = 'block';
    if (elements.regenText) elements.regenText.style.opacity = '0.5';
    elements.regenerateBtn.disabled = true;

    setTimeout(() => {
        const productTitle = data.name.toLowerCase();
        const productUrl = data.url || elements.aliLink.value.trim() || "[YOUR LINK HERE]";
        const duration = elements.postDuration ? elements.postDuration.value : 'medium';
        const worldPopLine = `Quick stat: There are ${WORLD_POPULATION_LABEL} people on Earth right now (${WORLD_POPULATION_DATE}).`;
        const commentTrigger = `Comment "LINK" and I will reply with specs & best deal tips.`;
        const safeName = data.name || 'this product';
        const safePrice = data.currentPrice && data.currentPrice !== "$--.--" ? data.currentPrice : "a budget price";
        const discountRate = Number.isFinite(parseInt(data.discount, 10)) ? parseInt(data.discount, 10) : 0;
        const dealLine = discountRate > 0 ? `Deal: ${discountRate}% OFF right now.` : "Deal: Limited-time pricing.";
        const ratingLine = data.rating ? `Rating: ${data.rating} (${data.reviews || '100+'} reviews).` : "";
        const rawDesc = (data.description || '').trim();
        const shortDesc = rawDesc ? rawDesc.substring(0, 120) : 'Practical, clean, and actually useful.';
        const longDesc = rawDesc ? rawDesc.substring(0, 260) : shortDesc;

        // 1. Detect Category
        let category = 'general';
        if (productTitle.match(/tech|led|mini|smart|phone|wireless|bluetooth|charger|keyboard/)) category = 'tech';
        else if (productTitle.match(/dress|hoodie|jacket|jeans|bag|backpack|jewelry|sneaker|style/)) category = 'fashion';
        else if (productTitle.match(/beauty|skincare|makeup|skin|face|hair|serum/)) category = 'beauty';
        else if (productTitle.match(/home|decor|clean|organizer|kitchen|room|light/)) category = 'home';

        // 2. Define Styles & Hooks
        const trendingHooks = [
            "POV: You found the holy grail of AliExpress! 💎",
            "STOP SCROLLING! 🛑 This is about to change your life.",
            "The secret is finally out... 🤫",
            "This is your sign to upgrade your life! ✨",
            "I can't believe I found this for only " + data.currentPrice + "! 😱"
        ];

        const useCaseByCategory = {
            tech: 'Best for desk setups, cleaning gear, and daily productivity.',
            fashion: 'Best for everyday styling and easy outfit upgrades.',
            beauty: 'Best for simple routines with visible results.',
            home: 'Best for quick space upgrades and daily convenience.',
            general: 'Best for smart, no-regret purchases.'
        };

        const useCaseLine = useCaseByCategory[category] || useCaseByCategory.general;

        const templateBank = {
            short: [
                `${safeName} at ${safePrice}. ${dealLine}\nDetails: ${shortDesc}`,
                `${safeName} for ${safePrice}. ${dealLine}\nDetails: ${shortDesc}\n${useCaseLine}`,
                `${safeName}. Price: ${safePrice}.\nDetails: ${shortDesc}`
            ],
            medium: [
                `${safeName} at ${safePrice}. ${ratingLine}\nDetails: ${shortDesc}\n${useCaseLine}`,
                `${safeName} for ${safePrice}.\n${ratingLine} Details: ${shortDesc}\n${useCaseLine}`,
                `${safeName} at ${safePrice}.\nDetails: ${shortDesc}\n${dealLine} ${useCaseLine}`
            ],
            long: [
                `${safeName} at ${safePrice}.\n\nDetails: ${longDesc}\n\n${ratingLine} ${dealLine} ${useCaseLine}`,
                `${safeName} for ${safePrice}.\n\nWhat you get: ${longDesc}\n\n${ratingLine} ${dealLine} ${useCaseLine}`,
                `${safeName} at ${safePrice}.\n\nWhy it stands out: ${longDesc}\n\n${ratingLine} ${dealLine} ${useCaseLine}`
            ]
        };

        const categoryTweaks = {
            tech: 'Built for gadgets, setups, and daily productivity.',
            fashion: 'Style-first, budget-friendly, and easy to wear.',
            beauty: 'Simple routine upgrade with visible results.',
            home: 'Clean look + practical use for everyday life.',
            general: 'Practical and budget-smart.'
        };

        const pickTemplate = (items) => items[Math.floor(Math.random() * items.length)];
        let body = pickTemplate(templateBank[duration] || templateBank.medium);
        body += `\n${categoryTweaks[category] || categoryTweaks.general}`;

        const hook = trendingHooks[Math.floor(Math.random() * trendingHooks.length)];
        const discountMsg = discountRate > 15 ? `🔥 Get ${discountRate}% OFF today!` : "💎 Limited time deal!";
        const ctaLine = `Grab it here 👉 ${productUrl}`;
        const postSections = [hook, body, discountMsg, worldPopLine, ctaLine];
        if (duration === 'short') {
            postSections.push(commentTrigger);
        }
        const selectedPost = postSections.join('\n\n');
        const cleanedPost = selectedPost
            .replace(/^\s*AI take:\s*/gmi, '')
            .replace(/\n{3,}/g, '\n\n');

        elements.viralPost.innerText = cleanedPost;
        elements.viralPost.classList.remove('skeleton-text');
        const selection = window.getSelection();
        if (selection && selection.removeAllRanges) {
            selection.removeAllRanges();
        }

        // Reset UI
        if (elements.regenLoader) elements.regenLoader.style.display = 'none';
        if (elements.regenText) elements.regenText.style.opacity = '1';
        elements.regenerateBtn.disabled = false;
        isGenerating = false;

        // 3. Smart Hashtag Mixer (2026 Trending)
        const viralTags = ['#FacebookFinds', '#FacebookDeals', '#DealAlert', '#SmartShopping', '#OnlineShopping', '#AliExpress'];
        const categoryTags = {
            'tech': ['#TechFinds', '#GadgetDeals', '#SetupUpgrade'],
            'fashion': ['#StyleFinds', '#OutfitInspo', '#BudgetStyle'],
            'beauty': ['#BeautyFinds', '#SkincareFinds', '#GlowUp'],
            'home': ['#HomeFinds', '#HomeUpgrade', '#CleanHome'],
            'general': ['#DailyFinds', '#BudgetFinds', '#SmartBuys']
        };

        const mixedTags = [
            `#${data.name.split(' ')[0].replace(/[^a-zA-Z]/g, '')}`,
            ...categoryTags[category],
            ...viralTags
        ];

        const finalTags = [...new Set(mixedTags)].slice(0, 7);
        elements.hashtags.innerHTML = finalTags.map(t => `<span class="hashtag">${t}</span>`).join('');

        log('Viral content generated with AI Trends!', 'success');
    }, 1500);
}


async function handleManualSubmit() {
    const sourceHtml = document.getElementById('m-source').value.trim();
    const manualImages = [];
    const manualImageInput = document.getElementById('m-image').value || '';
    manualImageInput.split(/[\n,]+/).forEach(item => addUniqueImage(manualImages, item));

    let data;
    if (sourceHtml) {
        log('Analyzing pasted HTML...', 'info');
        try {
            const sourceUrl = elements.aliLink.value.trim();
            data = await extractDataFromHTML(sourceHtml, sourceUrl);
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
            image: manualImages[0] || PLACEHOLDER_IMAGE,
            images: manualImages,
            videos: [],
            rating: 'N/A',
            reviews: '0',
            features: ['Premium Quality', 'Best Deal']
        };
    } else if (manualImages.length) {
        const mergedImages = [...(data.images || [])];
        manualImages.forEach(url => addUniqueImage(mergedImages, url));
        data.images = mergedImages;
        const hasImage = data.image && data.image !== PLACEHOLDER_IMAGE;
        data.image = hasImage ? data.image : (mergedImages[0] || PLACEHOLDER_IMAGE);
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
