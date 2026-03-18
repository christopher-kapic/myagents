import { jsx as _jsx } from "react/jsx-runtime";
import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_auth/agents")({
    component: AgentsLayout,
});
function AgentsLayout() {
    return _jsx(Outlet, {});
}
