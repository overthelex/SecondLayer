import 'package:google_sign_in/google_sign_in.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/secure_storage.dart';
import 'models/user.dart';

class AuthRepository {
  final ApiClient _api;
  final SecureStorage _storage;
  final GoogleSignIn _googleSignIn;

  AuthRepository({
    required ApiClient api,
    required SecureStorage storage,
    GoogleSignIn? googleSignIn,
  })  : _api = api,
        _storage = storage,
        _googleSignIn = googleSignIn ?? GoogleSignIn(scopes: ['email', 'profile']);

  Future<User> signInWithEmail(String email, String password) async {
    final response = await _api.post('/auth/login', data: {
      'email': email,
      'password': password,
    });
    final data = response.data as Map<String, dynamic>;
    await _storage.setToken(data['token'] as String);
    if (data['refreshToken'] != null) {
      await _storage.setRefreshToken(data['refreshToken'] as String);
    }
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<User> register({
    required String name,
    required String email,
    required String password,
  }) async {
    final response = await _api.post('/auth/register', data: {
      'name': name,
      'email': email,
      'password': password,
    });
    final data = response.data as Map<String, dynamic>;
    await _storage.setToken(data['token'] as String);
    if (data['refreshToken'] != null) {
      await _storage.setRefreshToken(data['refreshToken'] as String);
    }
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<User> signInWithGoogle() async {
    final googleUser = await _googleSignIn.signIn();
    if (googleUser == null) throw Exception('Вхід через Google скасовано');

    final auth = await googleUser.authentication;
    final response = await _api.post('/auth/google/mobile', data: {
      'idToken': auth.idToken,
      'accessToken': auth.accessToken,
    });
    final data = response.data as Map<String, dynamic>;
    await _storage.setToken(data['token'] as String);
    if (data['refreshToken'] != null) {
      await _storage.setRefreshToken(data['refreshToken'] as String);
    }
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  /// Handle OAuth deep link callback (secondlayer://auth/callback?token=xxx)
  Future<User> handleDeepLinkAuth(String token) async {
    await _storage.setToken(token);
    return getProfile();
  }

  Future<User> getProfile() async {
    final response = await _api.get('/auth/me');
    return User.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> logout() async {
    try {
      await _api.post('/auth/logout');
    } catch (_) {
      // Ignore logout API errors
    }
    await _googleSignIn.signOut();
    await _storage.clearAll();
  }

  Future<bool> hasToken() => _storage.hasToken();
}
