import { commerceRouter } from "../lib/commerce/http";
import catalog from "./commerce-catalog";
import orders from "./commerce-orders";
import marketing from "./commerce-marketing";

// A separate, contract-validated module extends the existing shop without replacing its data.
const { router, route } = commerceRouter();
catalog(route);
orders(route);
marketing(route);
export default router;
