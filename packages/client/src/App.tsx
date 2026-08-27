import "./App.css";
import { trpc } from "./trpc.ts";

/** Renders the backend greeting with loading, retryable error, and success states. */
function App() {
	const greeting = trpc.greeting.useQuery();

	return (
		<main>
			<p className="eyebrow">tRPC + TanStack React Query</p>
			<h1>Server response</h1>

			{greeting.isPending && <p className="status">Loading…</p>}

			{greeting.isError && (
				<div className="status error" role="alert">
					<p>Could not fetch the greeting.</p>
					<small>{greeting.error.message}</small>
					<button type="button" onClick={() => void greeting.refetch()}>
						Try again
					</button>
				</div>
			)}

			{greeting.isSuccess && (
				<div className="result">
					<p>{greeting.data.message}</p>
					<small>
						Fetched at {new Date(greeting.data.fetchedAt).toLocaleString()}
					</small>
				</div>
			)}
		</main>
	);
}

export default App;
