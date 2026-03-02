import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/domain/auth_notifier.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/register_screen.dart';
import '../features/chat/presentation/chat_screen.dart';
import '../features/decisions/presentation/search_screen.dart';
import '../features/decisions/presentation/detail_screen.dart';
import '../features/legislation/presentation/library_screen.dart';
import '../features/legislation/presentation/toc_screen.dart';
import '../features/legislation/presentation/article_screen.dart';
import '../features/documents/presentation/documents_screen.dart';
import '../features/more/more_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/matters/presentation/clients_screen.dart';
import '../features/matters/presentation/matters_screen.dart';
import '../features/time_tracking/presentation/time_tracking_screen.dart';
import '../features/billing/presentation/billing_screen.dart';
import 'route_names.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authNotifierProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/chat',
    redirect: (context, state) {
      final isAuth = authState.isAuthenticated;
      final isAuthRoute = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register';

      if (!authState.isInitialized) return null;
      if (!isAuth && !isAuthRoute) return '/login';
      if (isAuth && isAuthRoute) return '/chat';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        name: RouteNames.login,
        builder: (_, __) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        name: RouteNames.register,
        builder: (_, __) => const RegisterScreen(),
      ),
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (_, state, child) => _AppShell(child: child),
        routes: [
          GoRoute(
            path: '/chat',
            name: RouteNames.chat,
            builder: (_, __) => const ChatScreen(),
          ),
          GoRoute(
            path: '/decisions',
            name: RouteNames.decisions,
            builder: (_, __) => const DecisionsSearchScreen(),
            routes: [
              GoRoute(
                path: ':id',
                name: RouteNames.decisionDetail,
                parentNavigatorKey: _rootNavigatorKey,
                builder: (_, state) => DecisionDetailScreen(
                  decisionId: state.pathParameters['id']!,
                ),
              ),
            ],
          ),
          GoRoute(
            path: '/legislation',
            name: RouteNames.legislation,
            builder: (_, __) => const LegislationLibraryScreen(),
            routes: [
              GoRoute(
                path: ':id',
                name: RouteNames.legislationToc,
                parentNavigatorKey: _rootNavigatorKey,
                builder: (_, state) => LegislationTocScreen(
                  legislationId: state.pathParameters['id']!,
                ),
                routes: [
                  GoRoute(
                    path: 'article/:num',
                    name: RouteNames.legislationArticle,
                    parentNavigatorKey: _rootNavigatorKey,
                    builder: (_, state) => LegislationArticleScreen(
                      legislationId: state.pathParameters['id']!,
                      articleNumber: state.pathParameters['num']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/documents',
            name: RouteNames.documents,
            builder: (_, __) => const DocumentsScreen(),
          ),
          GoRoute(
            path: '/more',
            name: RouteNames.more,
            builder: (_, __) => const MoreScreen(),
            routes: [
              GoRoute(
                path: 'profile',
                name: RouteNames.profile,
                parentNavigatorKey: _rootNavigatorKey,
                builder: (_, __) => const ProfileScreen(),
              ),
              GoRoute(
                path: 'clients',
                name: RouteNames.clients,
                parentNavigatorKey: _rootNavigatorKey,
                builder: (_, __) => const ClientsScreen(),
              ),
              GoRoute(
                path: 'matters',
                name: RouteNames.matters,
                parentNavigatorKey: _rootNavigatorKey,
                builder: (_, __) => const MattersScreen(),
              ),
              GoRoute(
                path: 'time-tracking',
                name: RouteNames.timeTracking,
                parentNavigatorKey: _rootNavigatorKey,
                builder: (_, __) => const TimeTrackingScreen(),
              ),
              GoRoute(
                path: 'billing',
                name: RouteNames.billing,
                parentNavigatorKey: _rootNavigatorKey,
                builder: (_, __) => const BillingScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

class _AppShell extends StatelessWidget {
  final Widget child;

  const _AppShell({required this.child});

  static int _indexFromLocation(String location) {
    if (location.startsWith('/chat')) return 0;
    if (location.startsWith('/decisions')) return 1;
    if (location.startsWith('/legislation')) return 2;
    if (location.startsWith('/documents')) return 3;
    if (location.startsWith('/more')) return 4;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final index = _indexFromLocation(location);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) {
          switch (i) {
            case 0:
              context.goNamed(RouteNames.chat);
            case 1:
              context.goNamed(RouteNames.decisions);
            case 2:
              context.goNamed(RouteNames.legislation);
            case 3:
              context.goNamed(RouteNames.documents);
            case 4:
              context.goNamed(RouteNames.more);
          }
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.chat_outlined), selectedIcon: Icon(Icons.chat), label: 'Чат'),
          NavigationDestination(icon: Icon(Icons.gavel_outlined), selectedIcon: Icon(Icons.gavel), label: 'Рішення'),
          NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'Закони'),
          NavigationDestination(icon: Icon(Icons.folder_outlined), selectedIcon: Icon(Icons.folder), label: 'Документи'),
          NavigationDestination(icon: Icon(Icons.more_horiz), selectedIcon: Icon(Icons.more_horiz), label: 'Ще'),
        ],
      ),
    );
  }
}
