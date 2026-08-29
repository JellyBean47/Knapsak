import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../utils/constants.dart';

class ProductImage extends StatelessWidget {
  final String? imageUrl;
  final double? width;
  final double? height;
  final BoxFit fit;
  final BorderRadius? borderRadius;
  final Widget? placeholder;

  const ProductImage({
    super.key,
    required this.imageUrl,
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
      return (w < h ? w : h) * 0.5;
    }
    return 40;
  }

  @override
  Widget build(BuildContext context) {
    final fallback = placeholder ??
        Icon(
          Icons.image_outlined,
          size: _iconSize,
          color: AppColors.border,
        );

    final url = imageUrl?.trim();
    if (url == null || url.isEmpty) {
      Widget child = Center(child: fallback);
      if (borderRadius != null) {
        child = ClipRRect(borderRadius: borderRadius!, child: child);
      }
      return child;
    }

    Widget child = kIsWeb
        ? Image.network(
            url,
            width: width,
            height: height,
            fit: fit,
            webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
            errorBuilder: (_, _, _) => Center(child: fallback),
            loadingBuilder: (context, child, progress) {
              if (progress == null) return child;
              return Center(child: fallback);
            },
          )
        : CachedNetworkImage(
            imageUrl: url,
            width: width,
            height: height,
            fit: fit,
            placeholder: (_, _) => Center(child: fallback),
            errorWidget: (_, _, _) => Center(child: fallback),
          );

    if (borderRadius != null) {
      child = ClipRRect(borderRadius: borderRadius!, child: child);
    }

    return child;
  }
}
