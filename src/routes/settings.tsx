import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
	component: SettingsLayout,
});

function SettingsLayout() {
	return (
		<div className="min-h-screen bg-background font-mono p-6">
			<h1 className="text-xl font-semibold mb-4">Settings</h1>
			<nav className="mb-6 border-b border-border pb-4">
				<ul className="flex gap-4">
					<li>
						<Link
							to="/settings"
							activeOptions={{ exact: true }}
							className="hover:text-primary border-b-2 border-transparent pb-1"
							activeProps={{
								className:
									"hover:text-primary border-b-2 border-primary text-primary pb-1",
							}}
						>
							Overview
						</Link>
					</li>
					<li>
						<Link
							to="/settings/categories"
							className="hover:text-primary border-b-2 border-transparent pb-1"
							activeProps={{
								className:
									"hover:text-primary border-b-2 border-primary text-primary pb-1",
							}}
						>
							Categories
						</Link>
					</li>
				</ul>
			</nav>
			<Outlet />
		</div>
	);
}
