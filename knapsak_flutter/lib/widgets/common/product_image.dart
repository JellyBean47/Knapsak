import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../utils/constants.dart';

class ProductImage extends StatelessWidget {
  final String? imageUrl;
  final String? category;
  final double? width;
  final double? height;
  final BoxFit fit;
  final BorderRadius? borderRadius;
  final Widget? placeholder;

  const ProductImage({
    super.key,
    required this.imageUrl,
    this.category,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.borderRadius,
    this.placeholder,
  });

  double get _iconSize {
    final w = width;
    final h = height;
    if (w != null && h != null && w.isFinite && h.isFinite) {
      return ((w < h ? w : h) * 0.45).clamp(22, 72);
    }
    return 40;
  }

  Widget get _fallback {
    if (placeholder != null) return placeholder!;
    final spec = _CategoryArt.spec(category);
    return ColoredBox(
      color: spec.background,
      child: Center(
        child: Icon(spec.icon, size: _iconSize, color: spec.foreground),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim();
    Widget child;
    if (url == null || url.isEmpty) {
      child = _fallback;
    } else if (kIsWeb) {
      child = Image.network(
        url,
        width: width,
        height: height,
        fit: fit,
        webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
        errorBuilder: (_, _, _) => _fallback,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return _fallback;
        },
      );
    } else {
      child = CachedNetworkImage(
        imageUrl: url,
        width: width,
        height: height,
        fit: fit,
        placeholder: (_, _) => _fallback,
        errorWidget: (_, _, _) => _fallback,
      );
    }

    if (width != null || height != null) {
      child = SizedBox(width: width, height: height, child: child);
    }

    if (borderRadius != null) {
      child = ClipRRect(borderRadius: borderRadius!, child: child);
    }

    return child;
  }
}

class _CategoryArt {
  const _CategoryArt(this.icon, this.background, this.foreground);

  final IconData icon;
  final Color background;
  final Color foreground;

  static _CategoryArt spec(String? category) {
    switch (category) {
      case 'bread':
        return const _CategoryArt(
          Icons.bakery_dining,
          Color(0xFFFFF3E0),
          Color(0xFFEF6C00),
        );
      case 'dairy':
        return const _CategoryArt(
          Icons.egg_alt,
          Color(0xFFE3F2FD),
          Color(0xFF1565C0),
        );
      case 'meat':
        return const _CategoryArt(
          Icons.set_meal,
          Color(0xFFFFEBEE),
          Color(0xFFC62828),
        );
      case 'produce':
        return const _CategoryArt(
          Icons.eco,
          Color(0xFFE8F5E9),
          Color(0xFF2E7D32),
        );
      case 'snacks':
        return const _CategoryArt(
          Icons.cookie,
          Color(0xFFFCE4EC),
          Color(0xFFAD1457),
        );
      case 'drinks':
        return const _CategoryArt(
          Icons.local_cafe,
          Color(0xFFE0F7FA),
          Color(0xFF00838F),
        );
      case 'cleaning':
        return const _CategoryArt(
          Icons.cleaning_services,
          Color(0xFFE8EAF6),
          Color(0xFF3949AB),
        );
      case 'pool':
        return const _CategoryArt(
          Icons.pool,
          Color(0xFFE0F2F1),
          AppColors.primary,
        );
      default:
        return const _CategoryArt(
          Icons.shopping_bag_outlined,
          AppColors.primaryLight,
          AppColors.primary,
        );
    }
  }
}
