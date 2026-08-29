import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/cart_provider.dart';
import '../../providers/products_provider.dart';
import '../../models/product.dart';
import '../../navigation/app_router.dart';
import '../../utils/constants.dart';
import '../../widgets/common/product_image.dart';

class ProductDetailScreen extends StatefulWidget {
  final String productId;
  const ProductDetailScreen({super.key, required this.productId});

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  int _quantity = 1;
  bool _isFavourited = false;

  // Look up product from provider catalog or fall back to demo data
  Product? _findProduct(ProductsProvider productsProvider) {
    try {
      return productsProvider.catalogProducts
          .firstWhere((p) => p.id == widget.productId);
    } catch (_) {}

    if (productsProvider.catalogSpecialProduct.id == widget.productId) {
      return productsProvider.catalogSpecialProduct;
    }

    return null;
  }

  void _addToCart(Product product) {
    final cart = context.read<CartProvider>();
    for (int i = 0; i < _quantity; i++) {
      cart.addItem(product);
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          _quantity == 1
              ? '${product.name} added to cart'
              : '$_quantity × ${product.name} added to cart',
        ),
        backgroundColor: AppColors.primary,
        behavior: SnackBarBehavior.floating,
        action: SnackBarAction(
          label: 'View Cart',
          textColor: Colors.white,
          onPressed: () => context.go(Routes.cart),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final productsProvider = context.watch<ProductsProvider>();
    final cart             = context.watch<CartProvider>();
    final product          = _findProduct(productsProvider);

    if (product == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Product')),
        body: const Center(
          child: Text('Product not found',
              style: TextStyle(color: AppColors.textSecondary)),
        ),
      );
    }

    final alreadyInCart = cart.quantityOf(product.id);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: CustomScrollView(
        slivers: [
          _buildAppBar(product),
          SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildPriceSection(product),
                _buildDeliveryBadge(product),
                _buildDivider(),
                _buildQuantitySelector(product),
                _buildDivider(),
                _buildDetailsSection(product),
                if (alreadyInCart > 0) _buildAlreadyInCartBanner(alreadyInCart),
                const SizedBox(height: 100), // space for bottom bar
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: _buildBottomBar(product),
    );
  }

  // ── App bar with image ────────────────────────────────────────────────────

  Widget _buildAppBar(Product product) {
    return SliverAppBar(
      expandedHeight: 280,
      pinned: true,
      backgroundColor: Colors.white,
      foregroundColor: AppColors.textPrimary,
      flexibleSpace: FlexibleSpaceBar(
        background: Stack(
          children: [
            // Product image / placeholder
            Container(
              color: AppColors.background,
              child: ProductImage(
                imageUrl: product.imageUrl,
                category: product.category,
                fit: BoxFit.contain,
              ),
            ),
            // Special badge
            if (product.isSpecial)
              Positioned(
                top: 60,
                left: 16,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.accent,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    product.savings != null
                        ? 'SAVE ${formatPrice(product.savings!)}'
                        : 'SPECIAL',
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 12),
                  ),
                ),
              ),
          ],
        ),
      ),
      actions: [
        IconButton(
          icon: Icon(
            _isFavourited ? Icons.favorite : Icons.favorite_border,
            color: _isFavourited ? AppColors.accent : AppColors.textSecondary,
          ),
          onPressed: () => setState(() => _isFavourited = !_isFavourited),
        ),
      ],
    );
  }

  // ── Price section ─────────────────────────────────────────────────────────

  Widget _buildPriceSection(Product product) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(formatPrice(product.price),
                  style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textPrimary)),
              if (product.originalPrice != null) ...[
                const SizedBox(width: 12),
                Text(
                  formatPrice(product.originalPrice!),
                  style: const TextStyle(
                      fontSize: 16,
                      color: AppColors.textSecondary,
                      decoration: TextDecoration.lineThrough),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.accentLight,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '${(((product.originalPrice! - product.price) / product.originalPrice!) * 100).round()}% OFF',
                    style: const TextStyle(
                        color: AppColors.accent,
                        fontSize: 11,
                        fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Text(product.name,
              style: const TextStyle(
                  fontSize: 16,
                  color: AppColors.textPrimary,
                  height: 1.4)),
          const SizedBox(height: 4),
          Text(product.category.toUpperCase(),
              style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textSecondary,
                  letterSpacing: 1)),
        ],
      ),
    );
  }

  // ── Delivery badge ────────────────────────────────────────────────────────

  Widget _buildDeliveryBadge(Product product) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.primaryLight,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.local_shipping_outlined,
                color: AppColors.primary, size: 18),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Estimated Delivery',
                    style: TextStyle(
                        fontSize: 11,
                        color: AppColors.textSecondary)),
                Text(product.delivery,
                    style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.primary,
                        fontWeight: FontWeight.w600)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ── Quantity selector ─────────────────────────────────────────────────────

  Widget _buildQuantitySelector(Product product) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          const Text('Quantity',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary)),
          const Spacer(),
          _QtyButton(
            icon: Icons.remove,
            onTap: _quantity > 1
                ? () => setState(() => _quantity--)
                : null,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text('$_quantity',
                style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.bold)),
          ),
          _QtyButton(
            icon: Icons.add,
            onTap: () => setState(() => _quantity++),
          ),
        ],
      ),
    );
  }

  // ── Details section ───────────────────────────────────────────────────────

  Widget _buildDetailsSection(Product product) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Product Details',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary)),
          const SizedBox(height: 12),
          _DetailRow(label: 'Category', value: product.category),
          _DetailRow(
              label: 'Price per unit', value: formatPrice(product.price)),
          if (product.savings != null)
            _DetailRow(
                label: 'You save', value: formatPrice(product.savings!)),
          _DetailRow(label: 'Delivery', value: product.delivery),
        ],
      ),
    );
  }

  Widget _buildAlreadyInCartBanner(int qty) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.primaryLight,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.shopping_bag_outlined,
              color: AppColors.primary, size: 18),
          const SizedBox(width: 8),
          Text('$qty already in your cart',
              style: const TextStyle(
                  color: AppColors.primary, fontSize: 13)),
          const Spacer(),
          GestureDetector(
            onTap: () => context.go(Routes.cart),
            child: const Text('View Cart',
                style: TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.bold,
                    fontSize: 13)),
          ),
        ],
      ),
    );
  }

  Widget _buildDivider() => const Divider(height: 1, color: AppColors.border);

  // ── Bottom bar ────────────────────────────────────────────────────────────

  Widget _buildBottomBar(Product product) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        child: Row(
          children: [
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Total',
                    style: TextStyle(
                        fontSize: 12, color: AppColors.textSecondary)),
                Text(
                  formatPrice(product.price * _quantity),
                  style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textPrimary),
                ),
              ],
            ),
            const SizedBox(width: 16),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () => _addToCart(product),
                icon: const Icon(Icons.shopping_bag_outlined),
                label: const Text('Add to Cart',
                    style: TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _QtyButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  const _QtyButton({required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          border: Border.all(
            color: onTap != null ? AppColors.primary : AppColors.border,
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(icon,
            size: 18,
            color: onTap != null
                ? AppColors.primary
                : AppColors.border),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 13, color: AppColors.textSecondary)),
          Text(value,
              style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
