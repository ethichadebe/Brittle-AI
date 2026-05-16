import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { STORE_CONFIGS } from "@accucery/types";
import type { GroceryList, StoreSlug } from "@accucery/types";
import { api } from "../lib/api";
import { useAnimatedMount } from "../hooks/useAnimatedMount";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [creating, setCreating] = useState<StoreSlug | null>(null);
  const [showModal, setShowModal] = useState(false);
  const modal = useAnimatedMount(showModal);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.lists.list().then(setLists).catch(console.error);
  }, []);

  const listsByStore = (slug: StoreSlug) =>
    lists.filter((l) => l.storeSlug === slug);

  const totalItems = (slug: StoreSlug) =>
    listsByStore(slug).reduce((s, l) => s + l.itemCount, 0);

  const totalPrice = (slug: StoreSlug) =>
    listsByStore(slug).reduce((s, l) => s + l.totalPrice, 0);

  const openCreate = (slug: StoreSlug) => {
    setCreating(slug);
    setNewName("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setTimeout(() => setCreating(null), 280);
  };

  const handleCreate = async () => {
    if (!creating || !newName.trim()) return;
    setSaving(true);
    try {
      const list = await api.lists.create(creating, newName.trim());
      setLists((prev) => [list, ...prev]);
      closeModal();
      void navigate({ to: "/lists/$listId", params: { listId: list.id } });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await api.lists.delete(id);
    setLists((prev) => prev.filter((l) => l.id !== id));
  };

  const storeName = STORE_CONFIGS.find((s) => s.slug === creating)?.name ?? "";

  return (
    <div className="page-fade-in">
      <header className="app-header">
        <h1>Accucery</h1>
      </header>

      <div className="store-list">
        {STORE_CONFIGS.map((store) => {
          const storeLists = listsByStore(store.slug);
          return (
            <div
              key={store.slug}
              className={`store-card${store.active ? "" : " coming-soon"}`}
              style={{ background: store.color }}
              onClick={() => store.active && openCreate(store.slug)}
            >
              <div className="store-card-header">
                <h2>{store.name}</h2>
                {store.active ? (
                  <span className="store-card-chevron">&rsaquo;&rsaquo;</span>
                ) : (
                  <span className="coming-soon-badge">Coming soon</span>
                )}
              </div>

              <div className="store-card-stats">
                <div className="store-stat">
                  <span className="store-stat-label">🛒 Items</span>
                  <span className="store-stat-value">{totalItems(store.slug)}</span>
                </div>
                <div className="store-stat">
                  <span className="store-stat-label">💳 Total price</span>
                  <span className="store-stat-value">
                    R {totalPrice(store.slug).toFixed(2)}
                  </span>
                </div>
              </div>

              {store.active && storeLists.length > 0 && (
                <div className="store-lists" onClick={(e) => e.stopPropagation()}>
                  {storeLists.map((list) => (
                    <div
                      key={list.id}
                      className="list-row"
                      onClick={() =>
                        navigate({ to: "/lists/$listId", params: { listId: list.id } })
                      }
                    >
                      <span className="list-row-name">{list.name}</span>
                      <div className="list-row-actions">
                        <button
                          className="btn-icon"
                          title="Delete list"
                          onClick={(e) => handleDelete(e, list.id)}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    className="add-list-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCreate(store.slug);
                    }}
                  >
                    + New list
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modal.rendered && (
        <div
          className={`modal-backdrop${modal.closing ? " modal-backdrop--closing" : ""}`}
          onClick={closeModal}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New {storeName} list</h3>
            <input
              className="modal-input"
              placeholder='e.g. "Weekly shop"'
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!newName.trim() || saving}
                onClick={handleCreate}
              >
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
