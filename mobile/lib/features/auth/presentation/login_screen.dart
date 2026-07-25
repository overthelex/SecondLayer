import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../domain/auth_notifier.dart';
import '../../../core/platform/platform_support.dart';
import '../../../navigation/route_names.dart';
import '../../../shared/theme/app_colors.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  /// Dark "glassy" input decoration shared by the email and password fields.
  /// The global inputDecorationTheme is light, so we override it locally here.
  InputDecoration _darkInputDecoration({
    required String hintText,
    required IconData icon,
    Widget? suffixIcon,
  }) {
    const fill = Color(0x0AFFFFFF); // rgba(255,255,255,0.04)
    const borderColor = Color(0x17FFFFFF); // rgba(255,255,255,0.09)
    OutlineInputBorder border([Color color = borderColor]) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(11),
          borderSide: BorderSide(color: color, width: 1),
        );
    return InputDecoration(
      filled: true,
      fillColor: fill,
      hintText: hintText,
      hintStyle: const TextStyle(color: AppColors.zinc600),
      prefixIcon: Icon(icon, color: AppColors.zinc600, size: 20),
      suffixIcon: suffixIcon,
      contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 14),
      enabledBorder: border(),
      border: border(),
      focusedBorder: border(AppColors.zinc500),
      errorBorder: border(AppColors.error),
      focusedErrorBorder: border(AppColors.error),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authNotifierProvider);
    final theme = Theme.of(context);

    ref.listen(authNotifierProvider, (prev, next) {
      if (next.isAuthenticated) {
        context.goNamed(RouteNames.chat);
      }
      if (next.error != null && prev?.error != next.error) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next.error!), backgroundColor: theme.colorScheme.error),
        );
      }
    });

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: AppColors.darkBackground,
      ),
      child: Scaffold(
        backgroundColor: AppColors.darkBackground,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Logo
                    Center(
                      child: Opacity(
                        opacity: 0.95,
                        child: Image.asset(
                          'assets/images/logo-white.png',
                          height: 184,
                        ),
                      ),
                    ),
                    const SizedBox(height: 32),

                    // Google Sign In - hidden on platforms without a
                    // google_sign_in plugin (e.g. Linux desktop).
                    if (PlatformSupport.googleSignInAvailable) ...[
                      ElevatedButton.icon(
                        onPressed: authState.isLoading
                            ? null
                            : () => ref.read(authNotifierProvider.notifier).signInWithGoogle(),
                        icon: const Text(
                          'G',
                          style: TextStyle(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.bold,
                            fontSize: 18,
                          ),
                        ),
                        label: const Text('Google'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.surface,
                          foregroundColor: AppColors.textPrimary,
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          textStyle: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 15,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                      const SizedBox(height: 22),
                      Row(children: const [
                        Expanded(child: Divider(color: AppColors.darkBorder)),
                        Padding(
                          padding: EdgeInsets.symmetric(horizontal: 14),
                          child: Text('або',
                              style: TextStyle(color: AppColors.zinc600, fontSize: 13)),
                        ),
                        Expanded(child: Divider(color: AppColors.darkBorder)),
                      ]),
                      const SizedBox(height: 22),
                    ],

                    // Email
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      style: const TextStyle(color: AppColors.zinc200),
                      cursorColor: AppColors.zinc200,
                      decoration: _darkInputDecoration(
                        hintText: 'your@email.com',
                        icon: Icons.mail_outline,
                      ),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Введіть email';
                        if (!v.contains('@')) return 'Невірний формат email';
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),

                    // Forgot password
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () {/* TODO: forgot password */},
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.textSecondary,
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                          minimumSize: const Size(0, 0),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: const Text('Забули пароль?',
                            style: TextStyle(fontSize: 13)),
                      ),
                    ),
                    const SizedBox(height: 6),

                    // Password
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      textInputAction: TextInputAction.done,
                      style: const TextStyle(color: AppColors.zinc200),
                      cursorColor: AppColors.zinc200,
                      decoration: _darkInputDecoration(
                        hintText: '••••••••',
                        icon: Icons.lock_outline,
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_off
                                : Icons.visibility,
                            color: AppColors.zinc600,
                            size: 20,
                          ),
                          onPressed: () =>
                              setState(() => _obscurePassword = !_obscurePassword),
                        ),
                      ),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Введіть пароль';
                        if (v.length < 6) return 'Мінімум 6 символів';
                        return null;
                      },
                      onFieldSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: 22),

                    // Submit
                    ElevatedButton(
                      onPressed: authState.isLoading ? null : _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.surface,
                        foregroundColor: AppColors.textPrimary,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        textStyle: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: authState.isLoading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: AppColors.textPrimary),
                            )
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: const [
                                Text('Увійти'),
                                SizedBox(width: 8),
                                Icon(Icons.arrow_forward, size: 18),
                              ],
                            ),
                    ),
                    const SizedBox(height: 18),

                    // Register link
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text('Немає акаунту?',
                            style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
                        TextButton(
                          onPressed: () => context.goNamed(RouteNames.register),
                          style: TextButton.styleFrom(
                            foregroundColor: AppColors.zinc200,
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            minimumSize: const Size(0, 0),
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          child: const Text('Зареєструватися',
                              style: TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.w600)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 28),

                    // Version
                    FutureBuilder<PackageInfo>(
                      future: PackageInfo.fromPlatform(),
                      builder: (context, snapshot) {
                        if (!snapshot.hasData) return const SizedBox.shrink();
                        final info = snapshot.data!;
                        return Text(
                          'v${info.version} (${info.buildNumber})',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: AppColors.zinc600,
                            fontSize: 11,
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _submit() {
    if (_formKey.currentState?.validate() ?? false) {
      ref.read(authNotifierProvider.notifier).signInWithEmail(
            _emailController.text.trim(),
            _passwordController.text,
          );
    }
  }
}
