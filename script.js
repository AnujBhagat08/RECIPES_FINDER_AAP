// script.js — optimized + smooth scroll on details

// Our MealDB API
const API = "https://www.themealdb.com/api/json/v1/1/";

// Shortcuts of selection
const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];

// DOM Elements (selecting the elememts)
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

// Local storage setup
let favorites = new Set(JSON.parse(localStorage.getItem("rf_favs") || "[]"));

// convert Array into String and store in localstorage
const saveFavs = () =>
  localStorage.setItem("rf_favs", JSON.stringify([...favorites]));

// General helpers
const showMessage = (txt, timeout = 2200) => {
  message.textContent = txt;
  message.classList.remove("hidden");
  if (timeout) setTimeout(() => message.classList.add("hidden"), timeout);
};
const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Network error");
  return res.json();
};

// Initialization of Theme
(async function init() {
  if (localStorage.getItem("rf_theme") === "light") {
    document.documentElement.classList.add("light");
    document.body.classList.add("light");
  }
  try {
    await loadFilters();
    await searchMeals("");
    renderFavsList();
  } catch (e) {
    console.error(e);
    showMessage("Initialization error — check network", 3500);
  }
})();

// Load category & area filters
async function loadFilters() {
  try {
    const [cats, areas] = await Promise.all([
      fetchJson(API + "list.php?c=list"),
      fetchJson(API + "list.php?a=list"),
    ]);
    cats.meals?.forEach((c) => {
      const o = new Option(c.strCategory, c.strCategory);
      categoryFilter.appendChild(o);
    });
    areas.meals?.forEach((a) => {
      const o = new Option(a.strArea, a.strArea);
      areaFilter.appendChild(o);
    });
  } catch {
    console.warn("filters load failed");
  }
}

// Search, random, and filter events
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  q ? searchMeals(q) : showMessage("Type something to search");
});

categoryFilter.addEventListener("change", applyFilters);
areaFilter.addEventListener("change", applyFilters);

randomBtn.addEventListener("click", async () => {
  try {
    const data = await fetchJson(API + "random.php");
    renderMeals(data.meals || []);
  } catch {
    showMessage("Random fetch failed");
  }
});

// Applying filters
async function applyFilters() {
  const cat = categoryFilter.value;
  const area = areaFilter.value;
  try {
    if (cat)
      renderMeals(
        (await fetchJson(API + "filter.php?c=" + encodeURIComponent(cat)))
          .meals || []
      );
    else if (area)
      renderMeals(
        (await fetchJson(API + "filter.php?a=" + encodeURIComponent(area)))
          .meals || []
      );
    else await searchMeals("");
  } catch {
    showMessage("Filter failed");
  }
}

// searching meals
async function searchMeals(query) {
  try {
    showMessage("Loading...");
    const url = query
      ? API + "search.php?s=" + encodeURIComponent(query)
      : API + "search.php?f=a";
    const data = await fetchJson(url);
    renderMeals(data.meals || []);
  } catch {
    showMessage("Search failed — try again");
  }
}

// Render meal cards
function renderMeals(meals) {
  grid.innerHTML = "";
  detailsSection.classList.add("hidden");
  if (!meals?.length) return showMessage("No recipes found", 2000);

  meals.forEach((m) => {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = m.idMeal;
    card.innerHTML = `
      <div class="thumb" style="background-image:url(${m.strMealThumb})"></div>
      <div class="meta">
        <h4>${m.strMeal}</h4>
        <span class="tag">${m.strCategory || m.strArea || ""}</span>
        <div class="actions">
          <button class="small-btn view"><i class="fa-solid fa-eye"></i> View</button>
          <button class="small-btn fav">${
            favorites.has(m.idMeal)
              ? '<i class="fa-solid fa-heart"></i> Liked'
              : '<i class="fa-regular fa-heart"></i> Save'
          }</button>
        </div>
      </div>`;

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
    grid.appendChild(card);
  });
}

// Open meal details with smooth scroll animation
async function openDetails(id) {
  try {
    const data = await fetchJson(API + "lookup.php?i=" + id);
    const meal = data.meals?.[0];
    if (!meal) return showMessage("Recipe not found");

    detailsContent.innerHTML = `
      <div>
        <img class="thumb-large" src="${meal.strMealThumb}" alt="${
      meal.strMeal
    }">
      </div>
      <div>
        <h2>${meal.strMeal}</h2>
        <div class="meta-row">
          <span class="tag">${meal.strCategory || ""}</span>
          <span class="tag">${meal.strArea || ""}</span>
        </div>
        <div>
          <h4>Instructions</h4>
          <p style="white-space:pre-wrap;line-height:1.5">${
            meal.strInstructions || ""
          }</p>
        </div>
        <h4>Ingredients</h4>
        <div class="ingredients">
          ${Array.from({ length: 20 }, (_, i) => {
            const name = meal["strIngredient" + (i + 1)];
            const measure = meal["strMeasure" + (i + 1)];
            return name && name.trim()
              ? `<div class="ingredient">${name.trim()}${
                  measure ? " — " + measure.trim() : ""
                }</div>`
              : "";
          }).join("")}
        </div>
        <div style="margin-top:12px">
          ${
            meal.strYoutube
              ? `<a class="btn" target="_blank" rel="noopener" href="${meal.strYoutube}">
                <i class="fa-brands fa-youtube"></i> Watch
              </a>`
              : ""
          }
          <button class="btn alt" id="fav-toggle">${
            favorites.has(meal.idMeal) ? "Remove Favorite" : "Save to Favorites"
          }</button>
        </div>
      </div>`;

    detailsSection.classList.remove("hidden");
    detailsSection.setAttribute("aria-hidden", "false");

    // Smooth scroll into view
    detailsSection.scrollIntoView({ behavior: "smooth", block: "start" });

    // Favorite toggle inside details
    qs("#fav-toggle").addEventListener("click", () => {
      toggleFavorite(meal);
      renderFavsList();
      renderGridFavStates();
      qs("#fav-toggle").textContent = favorites.has(meal.idMeal)
        ? "Remove Favorite"
        : "Save to Favorites";
    });
  } catch {
    showMessage("Could not load recipe details");
  }
}

backToGrid.addEventListener("click", () => {
  detailsSection.classList.add("hidden");
  detailsSection.setAttribute("aria-hidden", "true");
});

// Favorites
function toggleFavorite(meal) {
  const id = meal.idMeal;
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  saveFavs();
  showMessage(
    favorites.has(id) ? "Saved to favorites" : "Removed from favorites"
  );
}

async function renderFavsList() {
  favList.innerHTML = "";
  if (!favorites.size) {
    favList.innerHTML = `<p style="color:var(--muted);text-align:center;padding:12px">No favorite recipes yet.</p>`;
    return;
  }

  for (const id of favorites) {
    try {
      const data = await fetchJson(API + "lookup.php?i=" + id);
      const meal = data.meals?.[0];
      if (!meal) continue;
      const item = document.createElement("div");
      item.className = "fav-item";
      item.innerHTML = `
        <img src="${meal.strMealThumb}" alt="${meal.strMeal}">
        <div style="flex:1">
          <div class="title">${meal.strMeal}</div>
          <div style="display:flex;gap:8px;margin-top:6px">
            <button class="small-btn view">View</button>
            <button class="small-btn remove"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`;
      item
        .querySelector(".view")
        .addEventListener("click", () => openDetails(meal.idMeal));
      item.querySelector(".remove").addEventListener("click", () => {
        favorites.delete(meal.idMeal);
        saveFavs();
        renderFavsList();
        renderGridFavStates();
      });
      favList.appendChild(item);
    } catch {
      console.warn("fav fetch failed");
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
  if (confirm("Clear all favorites?")) {
    favorites.clear();
    saveFavs();
    renderFavsList();
    renderGridFavStates();
  }
});

function renderGridFavStates() {
  qsa(".card").forEach((card) => {
    const id = card.dataset.id;
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

// Keep card states fresh
setInterval(renderGridFavStates, 1500);
