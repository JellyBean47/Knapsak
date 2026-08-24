import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/cart_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/location_provider.dart';
import '../../providers/products_provider.dart';
import '../../models/product.dart';
import '../../navigation/app_router.dart';
import '../../utils/constants.dart';
import '../../widgets/product/product_card.dart';
import '../../widgets/product/special_product_card.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _searchController = TextEditingController();
  String _shopMode = 'department';
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() => _searchQuery = _searchController.text);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cart     = context.watch<CartProvider>();
    final auth     = context.watch<AuthProvider>();
    final location = context.watch<LocationProvider>();
    final products = context.watch<ProductsProvider>();
    final displayProducts = products.searchCatalog(_searchQuery);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(context, cart, auth, location),
            _buildSearchBar(),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    _buildCategoryTabs(products),
                    if (_shopMode == 'department')
                      _buildDepartmentFilters(products)
                    else
                      _buildDeliveryFilters(products),
                    _buildSpecialSection(products),
                    if (products.isLoading && products.products.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(24),
                        child: CircularProgressIndicator(color: AppColors.primary),
                      )
                    else
                      _buildProductsGrid(cart, products, displayProducts),
                    _buildShowAllButton(products),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, CartProvider cart,
      AuthProvider auth, LocationProvider location) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          const Icon(Icons.location_on_outlined, color: AppColors.primary, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Delivering to',
                    style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                GestureDetector(
                  onTap: () => context.push(Routes.locationSettings),
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          location.isLoading
                              ? 'Finding location...'
                              : location.displayAddress,
                          style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.textPrimary,
                              fontWeight: FontWeight.w500),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const Icon(Icons.keyboard_arrow_down,
                          size: 16, color: AppColors.textSecondary),
                    ],
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined, color: AppColors.textSecondary),
            onPressed: () => context.push(Routes.settings),
          ),
          GestureDetector(
            onTap: () => auth.isLoggedIn
                ? context.push(Routes.profile)
                : context.push(Routes.login),
            child: Column(
              children: [
                const Icon(Icons.person_outline, color: AppColors.textSecondary),
                Text(
                  auth.isLoggedIn ? (auth.displayName ?? 'Account') : 'Sign In',
                  style: const TextStyle(fontSize: 11, color: AppColors.primary),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          GestureDetector(
            onTap: () => context.go(Routes.cart),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.accent,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Column(
                children: [
                  Badge(
                    isLabelVisible: cart.totalItems > 0,
                    label: Text('${cart.totalItems}'),
                    child: const Icon(Icons.shopping_bag_outlined,
                        color: Colors.white, size: 20),
                  ),
                  Text(
                    formatPrice(cart.totalPrice),
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.circular(8),
        ),
        child: TextField(
          controller: _searchController,
          decoration: InputDecoration(
            hintText: 'Search products...',
            prefixIcon: const Icon(Icons.search, color: AppColors.textSecondary),
            suffixIcon: _searchQuery.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.close, color: AppColors.textSecondary),
                    onPressed: () => _searchController.clear(),
                  )
                : null,
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            contentPadding: const EdgeInsets.symmetric(vertical: 12),
          ),
        ),
      ),
    );
  }

  Widget _buildCategoryTabs(ProductsProvider products) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      margin: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          _modeChip(
            'department',
            Icons.grid_view_outlined,
            'Shop by Department',
            products,
          ),
          const SizedBox(width: 12),
          _modeChip(
            'delivery',
            Icons.access_time_outlined,
            'Shop by Delivery',
            products,
          ),
        ],
      ),
    );
  }

  void _setShopMode(String mode, ProductsProvider products) {
    setState(() => _shopMode = mode);
    if (mode == 'department') {
      products.selectDelivery(null);
    } else {
      products.selectCategory(null);
    }
  }

  Widget _modeChip(
    String value,
    IconData icon,
    String label,
    ProductsProvider products,
  ) {
    final active = _shopMode == value;
    return GestureDetector(
      onTap: () => _setShopMode(value, products),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: active ? AppColors.primaryLight : AppColors.background,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            Icon(icon,
                size: 16,
                color: active ? AppColors.primary : AppColors.textSecondary),
            const SizedBox(width: 6),
            Text(label,
                style: TextStyle(
                    fontSize: 13,
                    color: active ? AppColors.primary : AppColors.textSecondary,
                    fontWeight: active ? FontWeight.w600 : FontWeight.normal)),
          ],
        ),
      ),
    );
  }

  Widget _buildDepartmentFilters(ProductsProvider products) {
    return Container(
      color: Colors.white,
      height: 48,
      margin: const EdgeInsets.only(bottom: 8),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        children: [
          _filterChip(
            label: 'All',
            active: products.selectedCategory == null,
            onTap: () => products.selectCategory(null),
          ),
          ...products.shopCategories.map((cat) => _filterChip(
                label: '${cat.icon} ${cat.label}',
                active: products.selectedCategory == cat.name,
                onTap: () => products.selectCategory(cat.name),
              )),
        ],
      ),
    );
  }

  Widget _buildDeliveryFilters(ProductsProvider products) {
    return Container(
      color: Colors.white,
      height: 48,
      margin: const EdgeInsets.only(bottom: 8),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        children: [
          _filterChip(
            label: 'All slots',
            active: products.selectedDelivery == null,
            onTap: () => products.selectDelivery(null),
          ),
          ...products.deliverySlots.map((slot) => _filterChip(
                label: slot,
                icon: Icons.access_time,
                active: products.selectedDelivery == slot,
                onTap: () => products.selectDelivery(slot),
              )),
        ],
      ),
    );
  }

  Widget _filterChip({
    required String label,
    required bool active,
    required VoidCallback onTap,
    IconData? icon,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: active ? AppColors.primary : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: active ? AppColors.primary : AppColors.border,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon,
                    size: 14,
                    color: active ? Colors.white : AppColors.textSecondary),
                const SizedBox(width: 4),
              ],
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                  color: active ? Colors.white : AppColors.textPrimary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSpecialSection(ProductsProvider products) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('BEST PRICE ON POOL',
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary)),
          const SizedBox(height: 12),
          SpecialProductCard(product: products.catalogSpecialProduct),
        ],
      ),
    );
  }

  Widget _buildProductsGrid(
      CartProvider cart, ProductsProvider products, List<Product> displayProducts) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${displayProducts.length} RESULTS',
                  style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textPrimary)),
              TextButton(
                onPressed: products.hasActiveFilter
                    ? () => context.read<ProductsProvider>().clearFilters()
                    : null,
                child: Text(products.hasActiveFilter ? 'Clear' : 'View All'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (displayProducts.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Column(
                children: [
                  Icon(Icons.search_off_outlined,
                      size: 48, color: AppColors.border),
                  const SizedBox(height: 12),
                  Text(
                    products.hasActiveFilter || _searchQuery.isNotEmpty
                        ? 'No products match your filters'
                        : 'No products available',
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
                  if (products.hasActiveFilter) ...[
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () =>
                          context.read<ProductsProvider>().clearFilters(),
                      child: const Text('Clear filters'),
                    ),
                  ],
                ],
              ),
            )
          else
            GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 0.72,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
            itemCount: displayProducts.length,
            itemBuilder: (context, index) => ProductCard(
              product: displayProducts[index],
              onAdd: () => cart.addItem(displayProducts[index]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildShowAllButton(ProductsProvider products) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: OutlinedButton.icon(
        onPressed: products.hasActiveFilter
            ? () => context.read<ProductsProvider>().clearFilters()
            : null,
        icon: const Icon(Icons.search, color: AppColors.textSecondary),
        label: Text(
          products.hasActiveFilter ? 'Clear All Filters' : 'Show All Results',
          style: const TextStyle(color: AppColors.textSecondary),
        ),
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 14),
          side: const BorderSide(color: AppColors.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      ),
    );
  }
}
