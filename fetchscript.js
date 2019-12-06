const searchForm = document.querySelector('#search-form');
const movie = document.querySelector('#movies');

function apiSearch(event) {
    event.preventDefault();
    const searchText = document.querySelector('.form-control').value;
    const server = 'https://api.themoviedb.org/3/search/multi?api_key=ddd303084d05c0b61b51d539910ef146&language=ru&query=' + searchText;
    movie.innerHTML = 'Загрузка . . .';

    fetch(url)
        .then(function (value) {
            return value.json(); //возвращает promise
        })
        .then(function (output) {
            let inner = '';

            //вывод результата
            output.results.forEach(function (item) {
                // выведит значение которое существует
                let nameItem = item.name || item.title;
                //add адаптив верстку к пустой строке
                inner += `<div class="col-12 col-md-4 col-xl-3">${nameItem}ddd</div>`;
            });

            movie.innerHTML = inner;
        })

        .catch(function (reason) {
            movie.innerHTML = 'Упс, что то пошло не так!';
            console.log('error:' + reason.status);
        });
}

searchForm.addEventListener('submit', apiSearch);




