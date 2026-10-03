import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { STORE_CONFIGS } from "@accucery/types";
import type { GroceryList, StoreSlug } from "@accucery/types";
import { api } from "../lib/api";
import { formatRand, initials } from "../lib/format";
import { restoreList, withoutList } from "../lib/listOrder";
import { useAnimatedMount } from "../hooks/useAnimatedMount";
import { useAccountSession } from "../hooks/useAccountSession";
import { useDeferredDelete } from "../hooks/useDeferredDelete";
import { MoreIcon, PencilIcon, PersonIcon, PlusIcon, TrashIcon } from "../components/icons";
import { Intro } from "../components/Intro";
import { Wordmark } from "../components/Wordmark";
import { markIntroSeen, shouldShowIntro } from "../lib/onboarding";
import { StoreLogo, storeBarFill } from "../components/StoreBrand";

export const Route = createFileRoute("/")({
  component: HomePage,
});

// Width of the Rename + Delete buttons a card slides over to reveal.
const ACTIONS_WIDTH = 168;

const storeOf = (slug: StoreSlug) => STORE_CONFIGS.find((s) => s.slug === slug);
const storage = () => window.localStorage;

function HomePage() {
  const navigate = useNavigate();
  const { account } = useAccountSession();
  // null while loading, so the empty state never flashes before lists arrive.
  const [lists, setLists] = useState<GroceryList[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [openSwipe, setOpenSwipe] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const compact = useCompactOnScroll();

  useEffect(() => {
    api.lists
      .list()
      .then(setLists)
      .catch((e) => {
        console.error(e);
        setLoadError(true);
      });
  }, []);

  // #117: the intro, decided once both the lists and the session are known,
  // so a returning Shopper never glimpses it while they load.
  const [introDismissed, setIntroDismissed] = useState(false);
  const known = lists !== null && account !== undefined;
  const alreadyUsing = (lists?.length ?? 0) > 0 || !!account;
  const showIntro = known && !introDismissed && shouldShowIntro(storage, alreadyUsing);
  // Someone already using Accucery here never needs it, even if they later
  // empty their lists or sign out.
  useEffect(() => {
    if (known && alreadyUsing) markIntroSeen(storage);
  }, [known, alreadyUsing]);

  const leaveIntro = () => {
    markIntroSeen(storage);
    setIntroDismissed(true);
  };

  const deletion = useDeferredDelete<GroceryList>(
    (list) => api.lists.delete(list.id),
    (list, index) => setLists((prev) => (prev ? restoreList(prev, list, index) : prev))
  );
  const undoing = deletion.undoable;

  const removeList = (list: GroceryList) => {
    if (!lists) return;
    const { lists: rest, index } = withoutList(lists, list.id);
    setLists(rest);
    setOpenSwipe(null);
    setMenuFor(null);
    deletion.remove(list, index);
  };

  // Rename sheet
  const [renaming, setRenaming] = useState<GroceryList | null>(null);
  const renameSheet = useAnimatedMount(renaming !== null);
  const [renameTo, setRenameTo] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  // Kept while the sheet animates out, so its title doesn't blank mid-exit.
  const [renameTitle, setRenameTitle] = useState("");

  const startRename = (list: GroceryList) => {
    setOpenSwipe(null);
    setMenuFor(null);
    setRenameTo(list.name);
    setRenameTitle(list.name);
    setRenameError(null);
    setRenaming(list);
  };

  const saveRename = async () => {
    const name = renameTo.trim();
    if (!renaming || !name) return;
    if (name === renaming.name) {
      setRenaming(null);
      return;
    }
    setRenameSaving(true);
    try {
      await api.lists.rename(renaming.id, name);
      const id = renaming.id;
      setLists((prev) => prev?.map((l) => (l.id === id ? { ...l, name } : l)) ?? prev);
      setRenaming(null);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRenameSaving(false);
    }
  };

  const openCreate = () => navigate({ to: "/lists/new" });

  const avatar = account ? initials(account.email) : "";

  if (showIntro) {
    return (
      <Intro
        onGetStarted={() => {
          leaveIntro();
          void navigate({ to: "/lists/new" });
        }}
        onSkip={leaveIntro}
        onSignIn={() => {
          leaveIntro();
          void navigate({ to: "/sign-in", search: { then: "/" } });
        }}
      />
    );
  }

  return (
    <div className="page-fade-in home">
      <header className="home-header">
        <Wordmark />
        <button
          className="avatar"
          aria-label={account ? `Profile (${account.email})` : "Profile and sign in"}
          onClick={() => navigate({ to: "/profile" })}
        >
          {avatar || <PersonIcon />}
        </button>
      </header>

      {loadError && <p className="home-error">Couldn't load your lists. Check your connection and try again.</p>}

      {lists && lists.length === 0 && !loadError && (
        <div className="home-empty">
          <EmptyIllustration />
          <h2>Let's plan your shopping</h2>
          <p>Make a list for a store, and see what it costs before you go.</p>
          <button className="btn btn-primary btn-pill" onClick={openCreate}>
            New list
          </button>
        </div>
      )}

      {lists && lists.length > 0 && (
        <ul className="list-cards">
          {lists.map((list) => (
            <ListCard
              key={list.id}
              list={list}
              open={openSwipe === list.id}
              menuOpen={menuFor === list.id}
              onOpenChange={(open) => setOpenSwipe(open ? list.id : null)}
              onMenu={(open) => setMenuFor(open ? list.id : null)}
              onSelect={() => navigate({ to: "/lists/$listId", params: { listId: list.id } })}
              onRename={() => startRename(list)}
              onDelete={() => removeList(list)}
            />
          ))}
        </ul>
      )}

      {lists && lists.length > 0 && (
        <button
          className={`new-list-pill${compact ? " new-list-pill--compact" : ""}${undoing ? " new-list-pill--raised" : ""}`}
          aria-label="New list"
          onClick={openCreate}
        >
          <PlusIcon />
          <span className="new-list-pill-label">New list</span>
        </button>
      )}

      {undoing && (
        <div className="snackbar" role="status">
          <span className="snackbar-text">List removed</span>
          <button className="snackbar-action" onClick={deletion.undo}>
            UNDO
          </button>
        </div>
      )}

      {renameSheet.rendered && (
        <div
          className={`modal-backdrop${renameSheet.closing ? " modal-backdrop--closing" : ""}`}
          onClick={() => setRenaming(null)}
        >
          <div className="modal" role="dialog" aria-label="Rename list" onClick={(e) => e.stopPropagation()}>
            <h3>Rename "{renameTitle}"</h3>
            <input
              className="modal-input"
              aria-label="List name"
              autoFocus
              value={renameTo}
              onChange={(e) => setRenameTo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveRename()}
            />
            {renameError && <p className="form-error">{renameError}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setRenaming(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!renameTo.trim() || renameSaving} onClick={saveRename}>
                {renameSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

interface ListCardProps {
  list: GroceryList;
  open: boolean;
  menuOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onMenu: (open: boolean) => void;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}

// A list on the home screen. Swiping it left uncovers Rename and Delete;
// a vertical drag is left to the browser (touch-action: pan-y) so the page
// still scrolls.
function ListCard({ list, open, menuOpen, onOpenChange, onMenu, onSelect, onRename, onDelete }: ListCardProps) {
  const store = storeOf(list.storeSlug);
  const [drag, setDrag] = useState<number | null>(null);
  const gesture = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  // A drag ends with a click on the card; this stops it opening the list.
  const dragged = useRef(false);

  const offset = drag ?? (open ? -ACTIONS_WIDTH : 0);
  const progress = list.itemCount > 0 ? list.checkedCount / list.itemCount : 0;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesture.current = { x: e.clientX, y: e.clientY, base: open ? -ACTIONS_WIDTH : 0, horizontal: null };
    dragged.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // Any drag, either way, isn't a tap on the card.
      dragged.current = true;
      g.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!g.horizontal) {
        gesture.current = null;
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    setDrag(Math.min(0, Math.max(-ACTIONS_WIDTH, g.base + dx)));
  };

  const onPointerEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.horizontal || drag === null) return;
    onOpenChange(drag < -ACTIONS_WIDTH / 2);
    setDrag(null);
  };

  const onCardClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (open) onOpenChange(false);
    else onSelect();
  };

  return (
    <li className={`list-card-wrap${offset < 0 ? " list-card-wrap--revealed" : ""}`}>
      <div className="list-card-actions" aria-hidden={!open}>
        <button className="list-card-action" tabIndex={open ? 0 : -1} onClick={onRename}>
          <PencilIcon />
          Rename
        </button>
        <button className="list-card-action list-card-action--danger" tabIndex={open ? 0 : -1} onClick={onDelete}>
          <TrashIcon />
          Delete
        </button>
      </div>

      <div
        className={`list-card${drag !== null ? " list-card--dragging" : ""}`}
        style={{ transform: `translateX(${offset}px)` }}
        role="link"
        tabIndex={0}
        aria-label={`${list.name}, ${store?.name ?? list.storeSlug}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={onCardClick}
        onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onSelect()}
      >
        <div className="list-card-head">
          <div className="list-card-title">
            <h2 className="list-card-name">{list.name}</h2>
            {store ? (
              <span className="store-label">
                <StoreLogo store={store} />
              </span>
            ) : (
              <span className="store-label">{list.storeSlug}</span>
            )}
          </div>
          <button
            className="list-card-more"
            aria-label={`More for ${list.name}`}
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              onMenu(!menuOpen);
            }}
          >
            <MoreIcon />
          </button>
        </div>

        <div className="list-card-foot">
          {list.itemCount > 0 ? (
            <>
              <div className="progress-bar" aria-hidden="true">
                <i style={storeBarFill(store, progress)} />
              </div>
              <span className="list-card-count" aria-label={`${list.checkedCount} of ${list.itemCount} ticked`}>
                {list.checkedCount}/{list.itemCount}
              </span>
              {/* An estimate from the latest prices seen, not Basket Prices —
                  only an opened list stands behind its total (#77). */}
              <span className="list-card-total" title="Estimated from the latest prices seen. Open the list for current prices.">
                ≈ {formatRand(list.totalPrice)}
              </span>
            </>
          ) : (
            <span className="list-card-empty">No items yet</span>
          )}
        </div>
      </div>

      {menuOpen && (
        <>
          <div className="menu-dismiss" onClick={() => onMenu(false)} />
          <div className="card-menu" role="menu">
            <button role="menuitem" onClick={onRename}>
              <PencilIcon />
              Rename
            </button>
            <button role="menuitem" className="card-menu-danger" onClick={onDelete}>
              <TrashIcon />
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  );
}

// True while scrolling down past the top, so the New list pill shrinks out of
// the way of the cards; scrolling up or reaching the top grows it back.
function useCompactOnScroll() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= 24) setCompact(false);
      else if (y > last + 4) setCompact(true);
      else if (y < last - 4) setCompact(false);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return compact;
}

// A basket with a ticked list: Accucery's own, in the theme's teal.
function EmptyIllustration() {
  return (
    <svg className="home-empty-art" width="168" height="140" viewBox="0 0 168 140" fill="none" aria-hidden="true">
      <circle cx="84" cy="74" r="62" fill="var(--primary-soft)" />
      <rect x="58" y="20" width="56" height="70" rx="8" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />
      <path d="M68 38l4 4 7-8M68 56l4 4 7-8" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M86 39h18M86 57h18M68 74h36" stroke="var(--line-strong)" strokeWidth="3" strokeLinecap="round" />
      <path d="M36 82h96l-10 40a8 8 0 0 1-7.8 6H53.8a8 8 0 0 1-7.8-6L36 82z" fill="var(--primary)" />
      <path d="M62 94v22M84 94v22M106 94v22" stroke="var(--on-primary)" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <path d="M50 82l16-22M118 82l-16-22" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
