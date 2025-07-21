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
                // The hero section is hidden by CSS, so we display all products directly
                displayProducts(allProducts); 
            }
        })
        .catch(error => {
            console.error('Failed to load products:', error);
            productListings.innerHTML = `<p style="text-align: center; color: var(--text-light);">Could not load products. Please try again later.</p>`;
        });
        
    // --- Display Products in Grid ---
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

            // --- Generate HTML for different parts ---
            const saleBadgeHTML = product.sale_badge ? `<span class="sale-badge">${product.sale_badge}</span>` : '';
            const originalPriceHTML = product.original_price ? `<span class="original-price">${product.original_price}</span>` : '';
            const unitsSoldHTML = product.units_sold ? `<span class="units-sold">${product.units_sold} sold</span>` : '';
            const extraPromoHTML = product.extra_promo ? `<span class="extra-promo">${product.extra_promo}</span>` : '';
            const shippingHTML = product.shipping ? `<span class="shipping">${product.shipping}</span>` : '';
            
            // Generate star icons based on rating
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
            // When the search bar is empty, hide suggestions and show all products again
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
