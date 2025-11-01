// script.js — updated: caching, loading state, accessibility, featured on load

const API = "https://www.themealdb.com/api/json/v1/1/";
const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];

// DOM
const searchForm = qs("#search-form");
const searchInput = qs("#search-input");
const grid = qs("#grid");
const message = qs("#message");
const categoryFilter = qs("#category-filter");
const areaFilter = qs("#area-filter");
const randomBtn = qs("#random-btn");
const detailsSection = qs("#details");
const detailsContent = qs("#details-content");
const backToGrid = qs("#back-to-grid");
const favDrawer = qs("#favorites");
const openFavsBtn = qs("#open-favs");
const closeFavsBtn = qs("#close-favs");
const favList = qs("#fav-list");
const clearFavsBtn = qs("#clear-favs");
const themeToggle = qs("#theme-toggle");
const loader = qs("#loader");

// Simple cache (in-memory) + TTL
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const cache = new Map();

function cachedFetchJson(url) {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && now - cached.ts < CACHE_TTL) {
    return Promise.resolve(cached.data);
  }
  return fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error("Network");
      return res.json();
    })
    .then((data) => {
      cache.set(url, { ts: Date.now(), data });
      return data;
    });
}

// Local storage setup — ensure strings
let favorites = new Set(
  (JSON.parse(localStorage.getItem("rf_favs") || "[]") || []).map(String)
);
const saveFavs = () =>
  localStorage.setItem("rf_favs", JSON.stringify([...favorites]));

// Loading UI helpers
function setLoading(isLoading, hint = "") {
  if (isLoading) {
    loader.classList.remove("hidden");
    loader.setAttribute("aria-hidden", "false");
    if (hint) loader.querySelector(".loader-text").textContent = hint;
  } else {
    loader.classList.add("hidden");
    loader.setAttribute("aria-hidden", "true");
    loader.querySelector(".loader-text").textContent = "Loading…";
  }
}

function showMessage(txt, timeout = 2200) {
  message.textContent = txt;
  message.classList.remove("hidden");
  if (timeout) setTimeout(() => message.classList.add("hidden"), timeout);
}

// Escape simple html to avoid XSS when inserting text
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Initialization
(async function init() {
  // restore theme
  if (localStorage.getItem("rf_theme") === "light") {
    document.documentElement.classList.add("light");
    document.body.classList.add("light");
    themeToggle.setAttribute("aria-pressed", "true");
  }

  try {
    await loadFilters();
    // show featured: fetch 4 random meals in parallel
    await showFeaturedMeals(4);
    renderFavsList();
  } catch (e) {
    console.error(e);
    showMessage("Initialization error — check network", 3500);
  }
})();

async function loadFilters() {
  try {
    const [cats, areas] = await Promise.all([
      cachedFetchJson(API + "list.php?c=list"),
      cachedFetchJson(API + "list.php?a=list"),
    ]);
    cats?.meals?.forEach((c) => {
      const o = new Option(c.strCategory, c.strCategory);
      categoryFilter.appendChild(o);
    });
    areas?.meals?.forEach((a) => {
      const o = new Option(a.strArea, a.strArea);
      areaFilter.appendChild(o);
    });
  } catch (err) {
    console.warn("filters load failed", err);
  }
}

// Featured / homepage
async function showFeaturedMeals(count = 3) {
  setLoading(true, "Loading featured recipes");
  try {
    const jobs = Array.from({ length: count }, () =>
      cachedFetchJson(API + "random.php")
    );
    const results = await Promise.allSettled(jobs);
    const meals = results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value.meals || [])
      .slice(0, count);
    renderMeals(meals);
  } catch (e) {
    console.warn("featured load failed", e);
    showMessage("Could not load featured recipes");
  } finally {
    setLoading(false);
  }
}

// Events
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return showMessage("Type something to search");
  searchMeals(q);
  // clear after submit (small UX improvement)
  searchInput.value = "";
});

categoryFilter.addEventListener("change", applyFilters);
areaFilter.addEventListener("change", applyFilters);

randomBtn.addEventListener("click", async () => {
  setLoading(true, "Fetching random recipe");
  randomBtn.disabled = true;
  try {
    const data = await cachedFetchJson(API + "random.php");
    renderMeals(data.meals || []);
  } catch (e) {
    console.warn(e);
    showMessage("Random fetch failed");
  } finally {
    randomBtn.disabled = false;
    setLoading(false);
  }
});

async function applyFilters() {
  const cat = categoryFilter.value;
  const area = areaFilter.value;
  setLoading(true, "Applying filters");
  try {
    if (cat) {
      const data = await cachedFetchJson(
        API + "filter.php?c=" + encodeURIComponent(cat)
      );
      renderMeals(data.meals || []);
    } else if (area) {
      const data = await cachedFetchJson(
        API + "filter.php?a=" + encodeURIComponent(area)
      );
      renderMeals(data.meals || []);
    } else {
      // show featured if no filter
      await showFeaturedMeals(4);
    }
  } catch (e) {
    console.warn(e);
    showMessage("Filter failed");
  } finally {
    setLoading(false);
  }
}

// Search
async function searchMeals(query) {
  setLoading(true, "Searching");
  try {
    const url = API + "search.php?s=" + encodeURIComponent(query);
    const data = await cachedFetchJson(url);
    renderMeals(data.meals || []);
    if (!data.meals || !data.meals.length)
      showMessage("No recipes found", 2500);
  } catch (e) {
    console.warn(e);
    showMessage("Search failed — try again");
  } finally {
    setLoading(false);
  }
}

// Render meals — improved: uses <img loading="lazy"> + keyboard support
function renderMeals(meals) {
  grid.innerHTML = "";
  detailsSection.classList.add("hidden");
  if (!meals?.length) return showMessage("No recipes found", 2000);

  meals.forEach((m) => {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = m.idMeal;
    card.tabIndex = 0; // keyboard focus
    card.innerHTML = `
      <div class="thumb"><img loading="lazy" src="${
        m.strMealThumb
      }" alt="${escapeHtml(m.strMeal)}"></div>
      <div class="meta">
        <h4>${escapeHtml(m.strMeal)}</h4>
        <span class="tag">${escapeHtml(m.strCategory || m.strArea || "")}</span>
        <div class="actions">
          <button class="small-btn view" aria-label="View ${escapeHtml(
            m.strMeal
          )}"> <i class="fa-solid fa-eye"></i> View</button>
          <button class="small-btn fav" aria-label="Toggle favorite for ${escapeHtml(
            m.strMeal
          )}">${
      favorites.has(String(m.idMeal))
        ? '<i class="fa-solid fa-heart"></i> Liked'
        : '<i class="fa-regular fa-heart"></i> Save'
    }</button>
        </div>
      </div>`;

    // click handlers
    card.querySelector(".view").addEventListener("click", (e) => {
      e.stopPropagation();
      openDetails(m.idMeal);
    });
    card.querySelector(".fav").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(m);
      renderGridFavStates();
    });
    card.addEventListener("click", () => openDetails(m.idMeal));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDetails(m.idMeal);
      }
    });

    grid.appendChild(card);
  });
}

// Details
async function openDetails(id) {
  setLoading(true, "Loading recipe");
  try {
    const data = await cachedFetchJson(API + "lookup.php?i=" + id);
    const meal = data.meals?.[0];
    if (!meal) return showMessage("Recipe not found");

    detailsContent.innerHTML = `
      <div>
        <img class="thumb-large" src="${meal.strMealThumb}" alt="${escapeHtml(
      meal.strMeal
    )}">
      </div>
      <div>
        <h2>${escapeHtml(meal.strMeal)}</h2>
        <div class="meta-row">
          <span class="tag">${escapeHtml(meal.strCategory || "")}</span>
          <span class="tag">${escapeHtml(meal.strArea || "")}</span>
        </div>
        <div>
          <h4>Instructions</h4>
          <p style="white-space:pre-wrap;line-height:1.5">${escapeHtml(
            meal.strInstructions || ""
          )}</p>
        </div>
        <h4>Ingredients</h4>
        <div class="ingredients">
  <ul>
    ${Array.from({ length: 20 }, (_, i) => {
      const name = meal["strIngredient" + (i + 1)];
      const measure = meal["strMeasure" + (i + 1)];
      return name && name.trim()
        ? `<li>${escapeHtml(name.trim())}${
            measure ? " — " + escapeHtml(measure.trim()) : ""
          }</li>`
        : "";
    }).join("")}
  </ul>
</div>
        <div style="margin-top:12px">
          ${
            meal.strYoutube
              ? `<a class="btn" target="_blank" rel="noopener" href="${meal.strYoutube}"><i class="fa-brands fa-youtube"></i> Watch</a>`
              : ""
          }
          <button class="btn alt" id="fav-toggle">${
            favorites.has(String(meal.idMeal))
              ? "Remove Favorite"
              : "Save to Favorites"
          }</button>
        </div>
      </div>`;

    detailsSection.classList.remove("hidden");
    detailsSection.setAttribute("aria-hidden", "false");
    detailsSection.scrollIntoView({ behavior: "smooth", block: "start" });

    qs("#fav-toggle").addEventListener("click", () => {
      toggleFavorite(meal);
      renderFavsList();
      renderGridFavStates();
      qs("#fav-toggle").textContent = favorites.has(String(meal.idMeal))
        ? "Remove Favorite"
        : "Save to Favorites";
    });
  } catch (e) {
    console.warn(e);
    showMessage("Could not load recipe details");
  } finally {
    setLoading(false);
  }
}

backToGrid.addEventListener("click", () => {
  detailsSection.classList.add("hidden");
  detailsSection.setAttribute("aria-hidden", "true");
  // keep grid state intact — no clearing
});

// Favorites
function toggleFavorite(meal) {
  const id = String(meal.idMeal);
  if (favorites.has(id)) {
    favorites.delete(id);
    showMessage("Removed from favorites");
  } else {
    favorites.add(id);
    showMessage("Saved to favorites");
  }
  saveFavs();
}

async function renderFavsList() {
  favList.innerHTML = "";
  if (!favorites.size) {
    favList.innerHTML = `<p style="color:var(--muted);text-align:center;padding:12px">No favorite recipes yet.</p>`;
    return;
  }

  for (const id of favorites) {
    try {
      const data = await cachedFetchJson(API + "lookup.php?i=" + id);
      const meal = data.meals?.[0];
      if (!meal) continue;
      const item = document.createElement("div");
      item.className = "fav-item";
      item.innerHTML = `
        <img src="${meal.strMealThumb}" alt="${escapeHtml(meal.strMeal)}">
        <div style="flex:1">
          <div class="title">${escapeHtml(meal.strMeal)}</div>
          <div style="display:flex;gap:8px;margin-top:6px">
            <button class="small-btn view" aria-label="View ${escapeHtml(
              meal.strMeal
            )}">View</button>
            <button class="small-btn remove" aria-label="Remove ${escapeHtml(
              meal.strMeal
            )}"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`;

      item
        .querySelector(".view")
        .addEventListener("click", () => openDetails(meal.idMeal));
      item.querySelector(".remove").addEventListener("click", () => {
        if (confirm(`Remove "${meal.strMeal}" from favorites?`)) {
          favorites.delete(meal.idMeal);
          saveFavs();
          renderFavsList();
          renderGridFavStates();
        }
      });
      favList.appendChild(item);
    } catch (e) {
      console.warn("fav fetch failed", e);
    }
  }
}

openFavsBtn.addEventListener("click", () => {
  favDrawer.classList.toggle("hidden");
  favDrawer.setAttribute("aria-hidden", favDrawer.classList.contains("hidden"));
  renderFavsList();
});
closeFavsBtn.addEventListener("click", () => favDrawer.classList.add("hidden"));
clearFavsBtn.addEventListener("click", () => {
  if (!favorites.size) return showMessage("No favorites to clear");
  if (confirm("Clear all favorites? This cannot be undone.")) {
    favorites.clear();
    saveFavs();
    renderFavsList();
    renderGridFavStates();
  }
});

function renderGridFavStates() {
  qsa(".card").forEach((card) => {
    const id = String(card.dataset.id);
    const btn = card.querySelector(".fav");
    if (btn)
      btn.innerHTML = favorites.has(id)
        ? '<i class="fa-solid fa-heart"></i> Liked'
        : '<i class="fa-regular fa-heart"></i> Save';
  });
}

// Theme toggle
themeToggle.addEventListener("click", () => {
  const doc = document.documentElement;
  const isLight = doc.classList.toggle("light");
  document.body.classList.toggle("light", isLight);
  themeToggle.setAttribute("aria-pressed", isLight);
  localStorage.setItem("rf_theme", isLight ? "light" : "");
});

// Search debounce
function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

searchInput.addEventListener(
  "input",
  debounce((e) => {
    const v = e.target.value.trim();
    if (v.length >= 2) searchMeals(v);
  }, 700)
);

// Keep card states fresh — occasional update
setInterval(renderGridFavStates, 1500);
