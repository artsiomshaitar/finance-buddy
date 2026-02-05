import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/")({
	component: SettingsIndexPage,
});

function SettingsIndexPage() {
	return (
		<div className="max-w-2xl">
			<ul className="space-y-2">
				<li>
					<Link
						to="/settings/categories"
						className="block p-3 border border-border hover:bg-accent hover:text-accent-foreground transition-colors rounded-none"
					>
						<span className="font-medium">Category settings</span>
						<span className="text-muted-foreground text-sm block mt-1">
							Edit category names, icons, and options
						</span>
					</Link>
				</li>
				<li>
					<Link
						to="/settings/category-rules"
						className="block p-3 border border-border hover:bg-accent hover:text-accent-foreground transition-colors rounded-none"
					>
						<span className="font-medium">Category rules</span>
						<span className="text-muted-foreground text-sm block mt-1">
							Auto-categorize transactions by matching name or merchant
						</span>
					</Link>
				</li>
			</ul>
		</div>
	);
}
