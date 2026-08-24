import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:knapsak_flutter/firebase_options.dart';

class _MockFirebasePlatform extends FirebasePlatform {
  _MockFirebasePlatform(this._app);

  final FirebaseAppPlatform _app;

  @override
  Future<FirebaseAppPlatform> initializeApp({
    FirebaseOptions? options,
    String? name,
  }) async {
    return _app;
  }

  @override
  FirebaseAppPlatform app([String name = defaultFirebaseAppName]) {
    return _app;
  }
}

Future<void> setupFirebaseForTests() async {
  TestWidgetsFlutterBinding.ensureInitialized();

  final options = DefaultFirebaseOptions.currentPlatform;
  final app = FirebaseAppPlatform(
    defaultFirebaseAppName,
    options,
  );

  FirebasePlatform.instance = _MockFirebasePlatform(app);
  await Firebase.initializeApp(options: options);
}
