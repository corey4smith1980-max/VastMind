import { commerceRouter } from "../lib/commerce/http";
import catalog from "./commerce-catalog";
import orders from "./commerce-orders";
import marketing from "./commerce-marketing";
import growth from "./commerce-growth";

// A separate, contract-validated module extends the existing shop without replacing its data.
const { router, route } = commerceRouter();
catalog(route);
orders(route);
marketing(route);
growth(route);
export default router;
