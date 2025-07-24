document.addEventListener('DOMContentLoaded', () => {
    let allProducts = [];
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const searchSuggestions = document.getElementById('searchSuggestions');
    const productListings = document.getElementById('product-listings');

    // --- NEW: Function to shuffle the product array ---
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]]; // Swap elements
        }
    }

    // --- Fetch and Display Products ---
    fetch('products.json')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            shuffleArray(data); // <-- NEW: Shuffle the products before displaying
            allProducts = data;
            displayProducts(allProducts);
        })
        .catch(error => {
            console.error('Failed to load products:', error);
            productListings.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">Could not load products. Please try again later.</p>`;
        });

    // --- Display Products in Grid ---
    function displayProducts(products) {
        productListings.innerHTML = '';
        if (products.length === 0) {
            productListings.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">No products match your search.</p>`;
            return;
        }
        products.forEach(product => {
            const productCard = document.createElement('a');
            productCard.href = product.link;
            productCard.target = '_blank';
            productCard.classList.add('product-card');

            const saleBadgeHTML = product.sale_badge ? `<span class="sale-badge">${product.sale_badge}</span>` : '';
            const originalPriceHTML = product.original_price ? `<span class="original-price">${product.original_price}</span>` : '';
            const unitsSoldHTML = product.units_sold ? `<span class="units-sold">${product.units_sold} sold</span>` : '';
            const extraPromoHTML = product.extra_promo ? `<span class="extra-promo">${product.extra_promo}</span>` : '';
            const shippingHTML = product.shipping ? `<span class="shipping">${product.shipping}</span>` : '';
            
            let starsHTML = '';
            if (product.rating) {
                starsHTML += '<div class="star-rating">';
                for (let i = 0; i < 5; i++) {
                    starsHTML += `<i class="fas fa-star ${i < product.rating ? 'filled' : ''}"></i>`;
                }
                starsHTML += '</div>';
            }

            productCard.innerHTML = `
                <div class="product-image-container">
                    <img src="${product.image}" alt="${product.name}" class="product-image" onerror="this.onerror=null;this.src='placeholder.svg';">
                    <div class="cart-icon-overlay"><i class="fas fa-shopping-cart"></i></div>
                </div>
                <div class="product-info">
                    <h3>${product.name}</h3>
                    <div class="rating-line">
                        ${starsHTML}
                        ${unitsSoldHTML}
                    </div>
                    <div class="price-info">
                        <span class="price">${product.price}</span>
                        ${originalPriceHTML}
                    </div>
                    <div class="promo-line">
                        ${saleBadgeHTML}
                        ${extraPromoHTML}
                    </div>
                    <div class="meta-info">
                        ${shippingHTML}
                    </div>
                </div>
            `;
            
            productListings.appendChild(productCard);
        });
    }

    // --- Search Functionality ---
    function performSearch() {
        const query = searchInput.value.trim().toLowerCase();
        const filtered = allProducts.filter(p => p.name.toLowerCase().includes(query));
        displayProducts(filtered);
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
            displayProducts(allProducts);
        }
    });
    
    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', e => e.key === 'Enter' && performSearch());
    
    document.addEventListener('click', e => {
        if (!e.target.closest('.search-container')) {
            searchSuggestions.style.display = 'none';
        }
    });

    // --- Dynamic Copyright Year ---
    const currentYearSpan = document.getElementById('currentYear');
    if(currentYearSpan) {
        currentYearSpan.textContent = new Date().getFullYear();
    }
});
