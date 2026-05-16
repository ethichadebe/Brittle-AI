import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { ListItem, Product } from "@accucery/types";
import { api } from "../lib/api";
import { computeSummary } from "../lib/summary";
import { searchStub } from "../lib/stubProducts";

export const Route = createFileRoute("/lists/$listId")({
  component: ListPage,
});

function ListPage() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<ListItem[]>([]);
  const [listName, setListName] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [swipingId, setSwipingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const useLoyalty = localStorage.getItem("loyalty-enabled") === "true";
  const summary = computeSummary(items, useLoyalty);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.items.list(listId).then(setItems).catch(console.error);
    // Fetch list name from lists endpoint
    api.lists.list().then((lists) => {
      const found = lists.find((l) => l.id === listId);
      if (found) setListName(found.name);
    });
  }, [listId]);

  useEffect(() => {
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 50);
  }, [showSearch]);

  const addItem = async (product: Product) => {
    const item = await api.items.add(listId, product);
    setItems((prev) => [...prev, item]);
    setShowSearch(false);
    setQuery("");
  };

  const changeQty = async (item: ListItem, delta: number) => {
    const next = item.quantity + delta;
    if (next < 1) {
      setConfirmDeleteId(item.id);
      return;
    }
    const updated = await api.items.patch(listId, item.id, { quantity: next });
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  };

  const toggleCheck = async (item: ListItem) => {
    const updated = await api.items.patch(listId, item.id, { isChecked: !item.isChecked });
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  };

  const deleteItem = async (id: string) => {
    await api.items.delete(listId, id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setConfirmDeleteId(null);
    setSwipingId(null);
  };

  const price = (item: ListItem) =>
    useLoyalty && item.loyaltyPrice !== null ? item.loyaltyPrice : item.regularPrice;

  const results = searchStub(query);

  return (
    <>
      {/* Header */}
      <header className="list-header">
        <button className="btn-back" onClick={() => navigate({ to: "/" })}>‹</button>
        <h2 className="list-title">{listName || "List"}</h2>
        <div style={{ width: 32 }} />
      </header>

      {/* Summary bar */}
      <div className="summary-bar">
        <div className="summary-cell">
          <span className="summary-label">Unchecked</span>
          <span className="summary-value">R {summary.unchecked.toFixed(2)}</span>
        </div>
        <div className="summary-cell summary-cell--highlight">
          <span className="summary-label">Price to pay</span>
          <span className="summary-value">R {summary.priceToPay.toFixed(2)}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Total</span>
          <span className="summary-value">R {summary.total.toFixed(2)}</span>
        </div>
      </div>

      {/* Item list */}
      <ul className="item-list">
        {items.length === 0 && (
          <li className="item-empty">No items yet — tap + to search</li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            className={`item-row${item.isChecked ? " item-row--checked" : ""}${swipingId === item.id ? " item-row--swiping" : ""}`}
            onTouchStart={() => setSwipingId(null)}
          >
            {/* Swipe delete reveal */}
            {swipingId === item.id && (
              <button className="item-delete-reveal" onClick={() => setConfirmDeleteId(item.id)}>
                🗑
              </button>
            )}

            <img className="item-img" src={item.imageUrl} alt={item.productName} />

            <div className="item-info" onClick={() => toggleCheck(item)}>
              <span className="item-name">{item.productName}</span>
              <span className="item-price">
                R {price(item).toFixed(2)}
                {item.loyaltyPrice !== null && item.loyaltyPrice !== item.regularPrice && (
                  <span className="item-loyalty-price"> · R {item.loyaltyPrice.toFixed(2)}</span>
                )}
                {" "}× {item.quantity} = R {(price(item) * item.quantity).toFixed(2)}
              </span>
            </div>

            <div className="item-qty">
              <button className="qty-btn" onClick={() => changeQty(item, -1)}>−</button>
              <span className="qty-value">{item.quantity}</span>
              <button className="qty-btn" onClick={() => changeQty(item, 1)}>+</button>
              <button className="btn-icon item-swipe-btn" onClick={() => setSwipingId(swipingId === item.id ? null : item.id)}>
                ⋮
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* FAB */}
      <button className="fab" onClick={() => setShowSearch(true)}>+</button>

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="modal-backdrop" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Remove item?</h3>
            <p style={{ margin: "0.5rem 0 1.25rem", color: "#6b7280", fontSize: "0.9rem" }}>
              {items.find((i) => i.id === confirmDeleteId)?.productName}
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteItem(confirmDeleteId)}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Search bottom sheet */}
      {showSearch && (
        <div className="modal-backdrop" onClick={() => { setShowSearch(false); setQuery(""); }}>
          <div className="search-sheet" onClick={(e) => e.stopPropagation()}>
            <input
              ref={searchRef}
              className="modal-input"
              placeholder="Search products…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul className="search-results">
              {results.length === 0 && (
                <li className="item-empty">No products found</li>
              )}
              {results.map((product) => (
                <li key={product.productId} className="search-result-row" onClick={() => addItem(product)}>
                  <img className="item-img" src={product.imageUrl} alt={product.name} />
                  <div className="item-info">
                    <span className="item-name">{product.name}</span>
                    <span className="item-price">
                      R {product.regularPrice.toFixed(2)}
                      {product.loyaltyPrice !== null && (
                        <span className="item-loyalty-price"> · R {product.loyaltyPrice.toFixed(2)}</span>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
