import { AppShell, Container, Group, Title } from "@mantine/core";
import { PrintBleedUploader } from "./components/PrintBleedUploader.tsx";

/** Renders the application's reusable header, content, and footer layout. */
function App() {
	return (
		<AppShell header={{ height: 64 }} footer={{ height: 48 }} padding="md">
			<AppShell.Header>
				<Container h="100%" size="lg">
					<Group h="100%" justify="space-between">
						<Title order={2}>MTG Print Tools</Title>
					</Group>
				</Container>
			</AppShell.Header>

			<AppShell.Main>
				<Container py="xl" size="lg">
					<PrintBleedUploader />
				</Container>
			</AppShell.Main>
		</AppShell>
	);
}

export default App;
