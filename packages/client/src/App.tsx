import { AppShell, Button, Container, Group, Title } from "@mantine/core";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";

/**
 * Navigation metadata for the tools exposed by the shared application shell.
 *
 * Keeping labels and typed route destinations together ensures every page uses
 * TanStack Router links while allowing the shell to derive active-button styling
 * from the current pathname.
 */
const navigationItems = [
	{ label: "Image formatting", to: "/images" },
	{ label: "Decklist parser", to: "/decklist" },
] as const;

/**
 * Renders the persistent application chrome around the active tool route.
 *
 * The component observes only the current pathname so navigation buttons update
 * their active styling without coupling the shell to page-specific route state.
 * The nested route selected by TanStack Router is rendered through the outlet.
 */
function App() {
	const currentPath = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<AppShell header={{ height: 64 }} footer={{ height: 48 }} padding="md">
			<AppShell.Header>
				<Container h="100%" size="lg">
					<Group h="100%" justify="space-between" wrap="nowrap">
						<Title order={2} textWrap="nowrap">
							MTG Tools
						</Title>
						<Group gap="xs" wrap="nowrap">
							{navigationItems.map((item) => (
								<Button
									component={Link}
									key={item.to}
									to={item.to}
									variant={currentPath === item.to ? "light" : "subtle"}
								>
									{item.label}
								</Button>
							))}
						</Group>
					</Group>
				</Container>
			</AppShell.Header>

			<AppShell.Main>
				<Container py="xl" size="lg">
					<Outlet />
				</Container>
			</AppShell.Main>
		</AppShell>
	);
}

export default App;
