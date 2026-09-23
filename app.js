'use strict';
// Only the home screen is implemented. Hashes are the routing contract:
// #business = business dashboard; #catalog = unrestricted shared catalog.
const navigationStatus = document.getElementById('navigation-status');
const destinations = {
  business: { route: 'business', label: 'Кабинет бизнеса' },
  team: { route: 'catalog', label: 'Общий каталог' },
  guest: { route: 'catalog', label: 'Общий каталог' }
};
document.querySelectorAll('[data-role]').forEach(link => {
  link.addEventListener('click', () => {
    const role = link.dataset.role;
    const destination = destinations[role];
    // No authentication or access restrictions are applied to the catalog.
    // A future router can subscribe to this event and render the target screen.
    document.dispatchEvent(new CustomEvent('app:navigate', {
      detail: { role, route: destination.route }
    }));
  });
});
function reflectRoute() {
  const route = location.hash.slice(1);
  const labels = { business: 'Кабинет бизнеса', catalog: 'Общий каталог' };
  navigationStatus.hidden = !labels[route];
  navigationStatus.textContent = labels[route]
    ? `Переход: «${labels[route]}». Этот раздел ещё не подключён — сейчас реализована только главная страница.`
    : '';
}
window.addEventListener('hashchange', reflectRoute);
reflectRoute();
