import { createFileRoute } from "@tanstack/react-router";
import { parseStatement } from "@/lib/pdf-parser";

export const Route = createFileRoute("/api/upload")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const contentType = request.headers.get("content-type") ?? "";
				if (!contentType.includes("multipart/form-data")) {
					return new Response(
						JSON.stringify({ error: "Expected multipart/form-data" }),
						{ status: 400, headers: { "Content-Type": "application/json" } },
					);
				}
				const formData = await request.formData();
				const file = formData.get("file") as File | null;
				if (!file) {
					return new Response(JSON.stringify({ error: "Missing file" }), {
						status: 400,
						headers: { "Content-Type": "application/json" },
					});
				}
				const type = file.type;
				if (
					type !== "application/pdf" &&
					!file.name.toLowerCase().endsWith(".pdf")
				) {
					return new Response(
						JSON.stringify({ error: "Only PDF files are supported" }),
						{ status: 400, headers: { "Content-Type": "application/json" } },
					);
				}
				try {
					const buffer = await file.arrayBuffer();
					const debugParam =
						new URL(request.url).searchParams.get("debug") ??
						formData.get("debug");
					const debug =
						debugParam === "1" || String(debugParam).toLowerCase() === "true";
					const result = await parseStatement(buffer, {
						includeRawText: debug,
					});
					return Response.json(result);
				} catch (err) {
					return new Response(
						JSON.stringify({
							error: "Failed to parse PDF",
							detail: err instanceof Error ? err.message : String(err),
						}),
						{ status: 500, headers: { "Content-Type": "application/json" } },
					);
				}
			},
		},
	},
});
