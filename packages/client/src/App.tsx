import { AppShell, Container, Group, Text, Title } from "@mantine/core";

/** Renders the application's reusable header, content, and footer layout. */
function App() {
	return (
		<AppShell header={{ height: 64 }} footer={{ height: 48 }} padding="md">
			<AppShell.Header>
				<Container h="100%" size="lg">
					<Group h="100%" justify="space-between">
						<Title order={2}>MTG</Title>
					</Group>
				</Container>
			</AppShell.Header>

			<AppShell.Main>
				<Container size="lg" />
			</AppShell.Main>

			<AppShell.Footer>
				<Container h="100%" size="lg">
					<Group h="100%">
						<Text c="dimmed" size="sm">
							MTG
						</Text>
					</Group>
				</Container>
			</AppShell.Footer>
		</AppShell>
	);
}

export default App;
