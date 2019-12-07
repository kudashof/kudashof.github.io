const searchForm = document.querySelector('#search-form');
const movie = document.querySelector('#movies');
const urlPoster = 'https://image.tmdb.org/t/p/w500';


function apiSearch(event) {
    event.preventDefault();
    const searchText = document.querySelector('.form-control').value;
    const server = 'https://api.themoviedb.org/3/search/multi?api_key=ddd303084d05c0b61b51d539910ef146&language=ru&query=' + searchText;
    movie.innerHTML = '<div class="spinner"></div>';

    fetch(server)
        .then(function (value) {
            if (value.status !== 200) {
                return Promise.reject(new Error('Ошибка'))
            }
            return value.json(); //возвращает promise
        })
        .then(function (output) {
            // console.log(output);
            let inner = '';
            //вывод результата
            output.results.forEach(function (item) {
                // выведит значение которое существует
                // название фильма или сериала
                let nameItem = item.name || item.title;
                // постер, если нету заглушка
                const poster = item.poster_path ? urlPoster + item.poster_path : './img/noposter.jpg';
                //add адаптив верстку к пустой строке
                inner += `
                    <div class="col-12 col-md-6 col-xl-3 item">
                    <img src="${poster}" class="img_poster" alt="${nameItem}">
                    <h5>${nameItem}</h5>
                    </div>
                    `;
            });

            movie.innerHTML = inner;
        })

        .catch(function (reason) {
            movie.innerHTML = 'Упс, что то пошло не так!';
            console.log('error:' + reason);
        });
}

searchForm.addEventListener('submit', apiSearch);




