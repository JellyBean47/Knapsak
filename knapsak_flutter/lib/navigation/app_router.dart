import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../screens/shop/home_screen.dart';
import '../screens/shop/product_detail_screen.dart';
import '../screens/cart/cart_screen.dart';
import '../screens/cart/checkout_screen.dart';
import '../screens/orders/order_history_screen.dart';
import '../screens/orders/order_detail_screen.dart';
import '../screens/orders/order_confirmation_screen.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/signup_screen.dart';
import '../screens/auth/forgot_password_screen.dart';
import '../screens/profile/profile_screen.dart';
import '../screens/profile/address_management_screen.dart';
import '../screens/settings/settings_screen.dart';
import '../screens/settings/location_settings_screen.dart';
import '../widgets/common/main_scaffold.dart';

class Routes {
  static const home              = '/';
  static const login             = '/login';
  static const signup            = '/signup';
  static const forgotPassword    = '/forgot-password';
  static const cart              = '/cart';
  static const checkout          = '/checkout';
  static const orderHistory      = '/orders';
  static const orderDetail       = '/orders/:id';
  static const orderConfirmation = '/order-confirmation';
  static const profile           = '/profile';
  static const addressManagement = '/profile/addresses';
  static const settings          = '/settings';
  static const locationSettings  = '/settings/location';
  static const productDetail     = '/product/:id';
}

GoRouter createRouter(AuthProvider authProvider) {
  return GoRouter(
    initialLocation: Routes.home,
    refreshListenable: authProvider,
    redirect: (context, state) {
      final loggedIn = authProvider.isLoggedIn;
      final onAuthPage = state.matchedLocation == Routes.login ||
          state.matchedLocation == Routes.signup ||
          state.matchedLocation == Routes.forgotPassword;

      final protectedRoutes = [
        Routes.checkout,
        Routes.orderHistory,
        Routes.orderConfirmation,
        Routes.profile,
        Routes.addressManagement,
      ];
      final needsAuth = protectedRoutes
              .any((r) => state.matchedLocation.startsWith(r)) ||
          RegExp(r'^/orders/[^/]+$').hasMatch(state.matchedLocation);

      if (needsAuth && !loggedIn) return Routes.login;
      if (loggedIn && onAuthPage) return Routes.home;
      return null;
    },
    routes: [
      ShellRoute(
        builder: (context, state, child) => MainScaffold(child: child),
        routes: [
          GoRoute(path: Routes.home,         builder: (c, s) => const HomeScreen()),
          GoRoute(path: Routes.cart,         builder: (c, s) => const CartScreen()),
          GoRoute(path: Routes.orderHistory, builder: (c, s) => const OrderHistoryScreen()),
          GoRoute(path: Routes.profile,      builder: (c, s) => const ProfileScreen()),
        ],
      ),
      GoRoute(path: Routes.login,          builder: (c, s) => const LoginScreen()),
      GoRoute(path: Routes.signup,         builder: (c, s) => const SignupScreen()),
      GoRoute(path: Routes.forgotPassword, builder: (c, s) => const ForgotPasswordScreen()),
      GoRoute(path: Routes.checkout,       builder: (c, s) => const CheckoutScreen()),
      GoRoute(
        path: Routes.orderDetail,
        builder: (c, s) => OrderDetailScreen(orderId: s.pathParameters['id']!),
      ),
      GoRoute(path: Routes.orderConfirmation, builder: (c, s) => const OrderConfirmationScreen()),
      GoRoute(path: Routes.addressManagement, builder: (c, s) => const AddressManagementScreen()),
      GoRoute(path: Routes.settings,          builder: (c, s) => const SettingsScreen()),
      GoRoute(path: Routes.locationSettings,  builder: (c, s) => const LocationSettingsScreen()),
      GoRoute(
        path: Routes.productDetail,
        builder: (c, s) => ProductDetailScreen(productId: s.pathParameters['id']!),
      ),
    ],
  );
}
