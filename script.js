document.addEventListener('DOMContentLoaded', () => {

    // --- Sticky Header ---
    let lastScrollY = window.scrollY;
    const header = document.querySelector('.header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > lastScrollY && window.scrollY > 150) {
            header.classList.add('hidden');
        } else {
            header.classList.remove('hidden');
        }
        lastScrollY = window.scrollY;
    });

    // --- Global Variables ---
    let allProducts = [];
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const searchSuggestions = document.getElementById('searchSuggestions');
    const productListings = document.getElementById('product-listings');

    // --- Fetch and Display Products ---
    fetch('products.json')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            allProducts = data;
            if (allProducts.length > 0) {
                populateHero(allProducts[0]); // Use first product for Hero
                displayProducts(allProducts.slice(1)); // Display rest in grid
            }
        })
        .catch(error => {
            console.error('Failed to load products:', error);
            productListings.innerHTML = `<p style="text-align: center; color: var(--text-light);">Could not load products. Please try again later.</p>`;
        });

    // --- Populate Hero Section ---
    function populateHero(product) {
        document.getElementById('hero-product-image-container').innerHTML = `
            <img src="${product.image}" alt="${product.name}" id="hero-product-image" onerror="this.onerror=null;this.src='placeholder.svg';">
        `;
        document.getElementById('hero-product-name').textContent = product.name;
        document.getElementById('hero-product-price').textContent = product.price;
        document.getElementById('hero-product-link').href = product.link;
    }

// REPLACE the old displayProducts function with this new one
function displayProducts(products) {
    productListings.innerHTML = '';
    if (products.length === 0) {
        productListings.innerHTML = `<p style="text-align: center; color: var(--text-light);">No products match your search.</p>`;
        return;
    }
    products.forEach(product => {
        const productCard = document.createElement('a');
        productCard.href = product.link;
        productCard.target = '_blank';
        productCard.classList.add('product-card');

        // Conditionally create the HTML for each piece of data
        const saleBadgeHTML = product.sale_badge ? `<span class="sale-badge">${product.sale_badge}</span>` : '';
        const originalPriceHTML = product.original_price ? `<span class="original-price">${product.original_price}</span>` : '';
        const unitsSoldHTML = product.units_sold ? `<span class="units-sold">${product.units_sold} sold</span>` : '';
        const extraPromoHTML = product.extra_promo ? `<span class="extra-promo">${product.extra_promo}</span>` : '';

        productCard.innerHTML = `
            <div class="product-image-container">
                <img src="${product.image}" alt="${product.name}" class="product-image" onerror="this.onerror=null;this.src='placeholder.svg';">
                <div class="cart-icon-overlay"><i class="fas fa-shopping-cart"></i></div>
            </div>
            <div class="product-info">
                <h3>${product.name}</h3>
                <div class="price-info">
                    <span class="price">${product.price}</span>
                    ${originalPriceHTML}
                </div>
                <div class="promo-line">
                    ${saleBadgeHTML}
                    ${extraPromoHTML}
                </div>
                <div class="meta-info">
                    ${unitsSoldHTML}
                    <span class="shipping">${product.shipping}</span>
                </div>
            </div>
        `;
        productListings.appendChild(productCard);
    });
}
    // --- Search Functionality ---
    function performSearch() {
        const query = searchInput.value.trim().toLowerCase();
        if (query) {
            const filteredProducts = allProducts.filter(p => p.name.toLowerCase().includes(query));
            displayProducts(filteredProducts); // Search across all products
        } else {
            displayProducts(allProducts.slice(1)); // Show default grid if search is empty
        }
        searchSuggestions.style.display = 'none';
    }

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        searchSuggestions.innerHTML = '';
        if (query) {
            const filtered = allProducts.filter(p => p.name.toLowerCase().includes(query)).slice(0, 5);
            if (filtered.length > 0) {
                filtered.forEach(product => {
                    const div = document.createElement('div');
                    div.classList.add('suggestion');
                    div.textContent = product.name;
                    div.onclick = () => {
                        searchInput.value = product.name;
                        searchSuggestions.style.display = 'none';
                        displayProducts([product]);
                    };
                    searchSuggestions.appendChild(div);
                });
            } else {
                searchSuggestions.innerHTML = `<div class="no-results">No results found</div>`;
            }
            searchSuggestions.style.display = 'block';
        } else {
            searchSuggestions.style.display = 'none';
        }
    });

    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', e => e.key === 'Enter' && performSearch());
    document.addEventListener('click', e => {
        if (!e.target.closest('.search-container')) {
            searchSuggestions.style.display = 'none';
        }
    });

    // --- Countdown Timer ---
    const countdownElement = document.getElementById('countdown');
    const endTime = new Date('July 31, 2025 23:59:59').getTime();
    const interval = setInterval(() => {
        const now = new Date().getTime();
        const distance = endTime - now;
        if (distance < 0) {
            clearInterval(interval);
            countdownElement.textContent = "DEAL EXPIRED";
            return;
        }
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        countdownElement.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }, 1000);

    // --- Dynamic Copyright Year ---
    document.getElementById('currentYear').textContent = new Date().getFullYear();
});
