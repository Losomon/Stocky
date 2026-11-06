import { lazy, Suspense } from "react";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";
import AppShell from "./components/AppShell";
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const CustomerForm = lazy(() => import("./pages/CustomerForm"));
const Customers = lazy(() => import("./pages/Customers"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inventory = lazy(() => import("./pages/Inventory"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const ProductForm = lazy(() => import("./pages/ProductForm"));
const Products = lazy(() => import("./pages/Products"));
const PurchaseDetail = lazy(() => import("./pages/PurchaseDetail"));
const PurchaseForm = lazy(() => import("./pages/PurchaseForm"));
const Purchases = lazy(() => import("./pages/Purchases"));
const SupplierDetail = lazy(() => import("./pages/SupplierDetail"));
const SupplierForm = lazy(() => import("./pages/SupplierForm"));
const Sales = lazy(() => import("./pages/Sales"));
const Settings = lazy(() => import("./pages/Settings"));
import Setup from "./pages/Setup";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import CreateBusiness from "./pages/CreateBusiness";
import AcceptInvitation from "./pages/AcceptInvitation";
import { useStock } from "./lib/store";
import { useAuth } from "./context/AuthContext";
import type { StockCtx } from "./lib/store";
import { Card, btnPrimary } from "./components/ui";

const Loading = () => <p className="mx-auto min-h-screen py-10 text-muted">Loading…</p>;

const AppRoutes = ({ stock }: { stock: StockCtx }) => (
  <Suspense fallback={<Loading />}>
    <Routes>
      <Route element={<AppShell stock={stock} />}>
        <Route index element={<Dashboard />} />
        <Route path="sales" element={<Sales />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="products" element={<Products />} />
        <Route path="products/new" element={<ProductForm mode="new" />} />
        <Route path="products/:id" element={<ProductDetail />} />
        <Route path="products/:id/edit" element={<ProductForm mode="edit" />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="purchases/new" element={<PurchaseForm mode="new" />} />
        <Route path="purchases/suppliers/new" element={<SupplierForm mode="new" />} />
        <Route path="purchases/suppliers/:id" element={<SupplierDetail />} />
        <Route path="purchases/suppliers/:id/edit" element={<SupplierForm mode="edit" />} />
        <Route path="purchases/:id" element={<PurchaseDetail />} />
        <Route path="purchases/:id/edit" element={<PurchaseForm mode="edit" />} />
        <Route path="settings" element={<Settings />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/new" element={<CustomerForm mode="new" />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="customers/:id/edit" element={<CustomerForm mode="edit" />} />
      </Route>
    </Routes>
  </Suspense>
);

export default function App() {
  const auth = useAuth();
  const stock = useStock();
  const location = useLocation();

  if (auth.loading) return <Loading />;

  // Supabase not configured: the app stays fully offline and local, exactly
  // as before. "demo-business" stamps every local record.
  if (!auth.configured) {
    if (stock.state?.setup) return <Suspense fallback={<Loading />}><Setup stock={stock} /></Suspense>;
    return <AppRoutes stock={stock} />;
  }

  // Keep the invitation flow mounted through sign-in/sign-up so it can claim
  // the token after Auth changes the user's state.
  if (location.pathname === "/accept-invitation") {
    return <Routes><Route path="accept-invitation" element={<AcceptInvitation />} /></Routes>;
  }
  if (location.pathname === "/sign-up" && auth.user) {
    return <Routes><Route path="sign-up" element={<SignUp />} /></Routes>;
  }

  // Signed out: show the sign-in / sign-up front door.
  if (!auth.user) {
    return (
      <Routes>
        <Route path="sign-in" element={<SignIn />} />
        <Route path="sign-up" element={<SignUp />} />
        <Route path="create-business" element={<Navigate to="/sign-in" replace />} />
        <Route path="accept-invitation" element={<AcceptInvitation />} />
        <Route path="/" element={<Navigate to="/sign-in" replace />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    );
  }

  if (auth.businessError) {
    return <main className="mx-auto max-w-lg p-6"><Card className="space-y-3"><h1 className="text-xl font-bold">Could not load your businesses</h1><p role="alert">{auth.businessError}</p><button className={btnPrimary} onClick={() => void auth.refreshBusinesses()}>Try again</button></Card></main>;
  }
  if (!auth.businessId && auth.businesses.length > 1) {
    return <main className="mx-auto max-w-lg space-y-4 p-6"><h1 className="text-2xl font-bold">Choose a business</h1><p className="text-muted">Select a business you belong to.</p>{auth.businesses.map((item) => <Card key={item.id}><button className="w-full text-left font-semibold" onClick={() => void auth.setActiveBusiness(item.id)}>{item.name}</button></Card>)}</main>;
  }
  if (location.pathname === "/create-business") return <CreateBusiness stock={stock} />;
  // Signed in without memberships: create a business or accept an invitation.
  if (!auth.businessId) return <CreateBusiness stock={stock} />;
  if (stock.state?.setup) return <Setup stock={stock} />;
  return <AppRoutes stock={stock} />;
}
