import { AppShell, Button, Container, Group, Title } from "@mantine/core";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";

/** Primary navigation destinations shown in the shared application shell. */
const navigationItems = [
	{ label: "Image formatting", to: "/images" },
	{ label: "Decklist parser", to: "/decklist" },
] as const;

/** Renders the application's reusable header, content, and footer layout. */
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
