import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/lists/$listId")({
  component: ListPage,
});

function ListPage() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <div style={{ padding: "1.25rem" }}>
      <button
        onClick={() => navigate({ to: "/" })}
        style={{
          background: "none",
          border: "none",
          fontSize: "1.5rem",
          cursor: "pointer",
          marginBottom: "1rem",
          display: "block",
        }}
      >
        ‹
      </button>
      <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>List {listId}</h2>
      <p style={{ marginTop: "0.5rem", color: "#6b7280" }}>
        Items coming in the next slice.
      </p>
    </div>
  );
}
