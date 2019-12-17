const searchForm = document.querySelector('#search-form');
const movie = document.querySelector('#movies');
const urlPoster = 'https://image.tmdb.org/t/p/w500';


function apiSearch(event) {
    event.preventDefault();
    const searchText = document.querySelector('.form-control').value;
    if (searchText.trim().length === 0) {
        movie.innerHTML = '<h2 class="col-12 text-center text-danger">Поле поиска не должно быть пустым</h2>'
        return
    }
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
            //сообщение если ничего не найдено по запросу
            if(output.results.length === 0){
                inner = '<h2 class="col-12 text-center text-info">По вашему запросу ничего не найдено</h2>';
            }
            //console.log(output.results.length);
            //вывод результата
            output.results.forEach(function (item) {
                console.log(item);
                // выведит значение которое существует
                // название фильма или сериала
                let nameItem = item.name || item.title;
                // постер, если нету заглушка
                const poster = item.poster_path ? urlPoster + item.poster_path : './img/noposter.jpg';
                let dataInfo = '';
                //убирает лишних персонажей
                if(item.media_type !=='percon') dataInfo = `data-id="${item.id}" data-type="${item.media_type}"`
                //add адаптив верстку к пустой строке
                inner += `
                    <div class="col-12 col-md-6 col-xl-3 item">
                    <img src="${poster}" class="img_poster" alt="${nameItem}" ${dataInfo}">
                    <h5>${nameItem}</h5>
                    </div>
                    `;
            });

            movie.innerHTML = inner;
            //обработчик клика на постер
            const media = movie.querySelectorAll('.item');
            media.forEach(function (elem) {
                elem.addEventListener('click', showFullInfo)
            })
        })

        .catch(function (reason) {
            movie.innerHTML = 'Упс, что то пошло не так!';
            console.log('error:' + reason);
        });
}

searchForm.addEventListener('submit', apiSearch);


function showFullInfo() {
    console.log(this);
}

