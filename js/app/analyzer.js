var app = angular.module('analyzer', ['ngRoute', 'ui.bootstrap', 'chart.js']);

app.config(['$routeProvider', '$httpProvider', function ($routeProvider, $httpProvider) {

        $routeProvider
                // route for the home page
                .when('/', {
                    templateUrl: 'pages/home.html',
                    controller: 'HomeController'
                })

                // route for the report page
                .when('/report', {
                    templateUrl: 'pages/report.html',
                    controller: 'ReportController',
                    resolve: {
                        "check": function (analyzerStateService, $location) {
                            analyzerViewModel = analyzerStateService.loadState();

                            if (analyzerViewModel.status !== 'readyToAnalyze' && analyzerViewModel.status !== 'analyzed') {
                                $location.path('/');
                            }
                            ;
                        }
                    }
                });

        $httpProvider.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';

    }]);

app.controller('HomeController', ['$scope', 'analyzerService', 'analyzerStateService', 'dataService' , '$rootScope', function ($scope, analyzerService, analyzerStateService, dataService, $rootScope) {

        $scope.analyzerViewModel = analyzerStateService.loadState();

        $scope.open = function (modal) {

            analyzerService.openModal(modal);

        };

        $scope.getPosting = function () {
            $scope.analyzerViewModel.loadingJobPosting = true;
            dataService.callPostingApi($scope.analyzerViewModel.postingControlNumber).then(function (data) {

                if (data.data.dutiesText && data.data.qualificationsText) {
                    $scope.analyzerViewModel.dutiesText = data.data.dutiesText;
                    $scope.analyzerViewModel.qualificationsText = data.data.qualificationsText;
                    
                } else {
                    $rootScope.message = "Unable to get data from posting. You can try again or you can just manually copy and paste the information from the posting.";
                    $rootScope.warning = true;
                    $scope.analyzerViewModel.manualDataEntryRequired = true;
                }

                $scope.analyzerViewModel.loadingJobPosting = false;
                
            }, function (error) {
                
                $rootScope.message = "Unable to get data from posting, please manually copy and paste it.";
                $rootScope.warning = true;
                
                $scope.analyzerViewModel.loadingJobPosting = false;
                $scope.analyzerViewModel.manualDataEntryRequired = true;

            }, function () {


            });
        };

        $scope.startAnalysis = function () {

            var validForm = analyzerService.validateForm($scope.analyzerViewModel);

            if (validForm.message) {

                $rootScope.message = validForm.message;
                $rootScope.warning = validForm.warning;

            } else {
                //Concatenate the posting text
                $scope.analyzerViewModel.fullPostText = $scope.analyzerViewModel.dutiesText + $scope.analyzerViewModel.qualificationsText;

                //Process the resume text
                $scope.analyzerViewModel.resumeText = analyzerService.processText($scope.analyzerViewModel.resumeText);

                //Save the analyzerViewModel
                analyzerStateService.saveState($scope.analyzerViewModel);

                analyzerService.openModal('emailForm');
            }

        };

        $scope.hideWarning = function () {
            $scope.warning = false;
        };

    }]);

app.controller('ReportController', ['$scope', 'analyzerService', 'analyzerStateService', 'dataService', function ($scope, analyzerService, analyzerStateService, dataService) {

        $scope.analyzerViewModel = analyzerStateService.loadState();

        if ($scope.analyzerViewModel.status === "readyToAnalyze") {

            $scope.analyzerViewModel.loading = true;

            dataService.callTextAnalysisApi($scope.analyzerViewModel.fullPostText).then(function (data) {

                $scope.analyzerViewModel.postTextAnalysis.keyWords = data.data.keywords;
                $scope.analyzerViewModel.postTextAnalysis.keyWordAnalysis = analyzerService.analyzeText($scope.analyzerViewModel.postTextAnalysis.keyWords, $scope.analyzerViewModel.fullPostText);
                $scope.analyzerViewModel.jobPostingLabels = analyzerService.getLabels($scope.analyzerViewModel.postTextAnalysis.keyWordAnalysis);
                $scope.analyzerViewModel.jobPostingData = analyzerService.getDataPoints($scope.analyzerViewModel.postTextAnalysis.keyWordAnalysis);

                dataService.callTextAnalysisApi($scope.analyzerViewModel.resumeText).then(function (data) {

                    $scope.analyzerViewModel.resumeTextAnalysis.keyWords = data.data.keywords;
                    $scope.analyzerViewModel.resumeTextAnalysis.keyWordAnalysis = analyzerService.analyzeText($scope.analyzerViewModel.resumeTextAnalysis.keyWords, $scope.analyzerViewModel.resumeText);
                    $scope.analyzerViewModel.resumeLabels = analyzerService.getLabels($scope.analyzerViewModel.resumeTextAnalysis.keyWordAnalysis);
                    $scope.analyzerViewModel.resumeData = analyzerService.getDataPoints($scope.analyzerViewModel.resumeTextAnalysis.keyWordAnalysis);

                    $scope.analyzerViewModel.resumeScore = analyzerService.scoreResume($scope.analyzerViewModel.postTextAnalysis.keyWords, $scope.analyzerViewModel.resumeText);

                    $scope.analyzerViewModel.loading = false;

                    $scope.analyzerViewModel.status = 'analyzed';

                    analyzerStateService.saveState(analyzerViewModel);
                });

            });
        }
        ;

        $scope.open = function (modal) {

            analyzerService.openModal(modal);

        };

    }]);

app.controller('ModalInstanceController', ['$scope', '$uibModalInstance', 'dataService', '$location', 'analyzerStateService', '$rootScope', function ($scope, $uibModalInstance, dataService, $location, analyzerStateService, $rootScope) {

        $scope.emailAddress = "";
        $scope.emailError = false;
        $scope.ok = function () {
            $uibModalInstance.close();
        };

        $scope.sendEmail = function () {
            //Load the analyzerViewModel
            $scope.analyzerViewModel = analyzerStateService.loadState();

            dataService.callMailChimpApi($scope.emailAddress).then(
                    function (data) {
                        if (data.data.emailSent === true) {
                            $scope.analyzerViewModel.status = 'readyToAnalyze';
                            analyzerStateService.saveState($scope.analyzerViewModel);
                            $uibModalInstance.close();
                            $location.path('/report');
                        } else {
                            $scope.emailError = true;
                        }

                    }, function (error) {
                $scope.emailError = true;
            });

        };

    }]);

app.factory('analyzerStateService', [function () {

        var analyzerViewModel = {
            loadingJobPosting: false,
            manualDataEntryRequired: false,
            postingControlNumber: "",
            dutiesTest: "",
            qualificationsText: "",
            fullPostText: "",
            resumeText: "",
            loading: false,
            status: 'notStarted',
            jobPostingLabels: "",
            jobPostingData: "",
            resumeLabels: "",
            postTextAnalysis: [],
            resumeTextAnalysis: [],
            resumeScore: []
        };

        var saveState = function (newAnalyzerViewModel) {
            analyzerViewModel = newAnalyzerViewModel;
        };

        var loadState = function () {
            return analyzerViewModel;
        };

        return ({
            saveState: saveState,
            loadState: loadState
        });

    }]);

app.factory('analyzerService', ['$uibModal', function ($uibModal) {

        var openModal = function (modal) {

            $uibModal.open({
                animation: true,
                templateUrl: 'pages/modals/' + modal + '.html',
                controller: 'ModalInstanceController',
                size: 'lg'
            });

        };

        var validateForm = function (analyzerViewModel) {

            var warning = false;
            var messageText = "";

            //If the user did not enter any data in the federal job posting section, alert them
            if (!analyzerViewModel.dutiesText && !analyzerViewModel.qualificationsText) {
                warning = true;
            }
            ;

            //The user must have entered resume text to continue
            if (!analyzerViewModel.resumeText) {
                warning = true;
            }
            ;

            //Determine message
            if (warning) {
                messageText = "To continue, you must provide data for at least one of the job posting sections, and you must provide data for your resume.";
            }
            ;

            return ({
                warning: warning,
                message: messageText
            });

        };

        var processText = function (text) {

            var processedText = removePunctuation(text);

            processedText.replace(/\s+/g, ' ').trim();

            processedText = processedText.toUpperCase();

            return processedText;

        };

        var analyzeText = function (keywords, text) {

            var topKeyWords = keywords.length >= 5 ? keywords.slice(0, 5) : keywords;
            var topKeyWordAnalysis = [];

            for (i = 0; i < topKeyWords.length; i++) {
                topKeyWordAnalysis.push({
                    keyWord: topKeyWords[i].text,
                    occurences: occurrences(text, topKeyWords[i].text)
                });
            }

            return topKeyWordAnalysis;

        };

        var getLabels = function (keyWordData) {
            var labels = [];
            for (i = 0; i < keyWordData.length; i++) {
                labels.push(keyWordData[i].keyWord);
            }

            return labels;
        };

        var getDataPoints = function (keyWordData) {
            var dataPoints = [];

            for (i = 0; i < keyWordData.length; i++) {
                dataPoints.push(keyWordData[i].occurences);
            }

            return dataPoints;

        };

        var scoreResume = function (postingKeyWords, resumeText) {

            var resumeScore = {
                matchedKeywords: [],
                missedKeywords: [],
                overallScore: []
            };

            var totalPossibleScore = postingKeyWords.length;
            var resumeOverallScore = 0;
            var numberOfMatches = 0;

            for (i = 0; i < postingKeyWords.length; i++) {
                var keywordOccurrences = occurrences(resumeText, postingKeyWords[i].text);

                if (keywordOccurrences > 0) {
                    numberOfMatches++;
                    resumeScore.matchedKeywords.push({
                        keyWord: postingKeyWords[i].text,
                        relevance: postingKeyWords[i].relevance,
                        occurrences: keywordOccurrences
                    });
                } else {
                    resumeScore.missedKeywords.push({
                        keyWord: postingKeyWords[i].text,
                        relevance: postingKeyWords[i].relevance
                    });
                }
            }
            ;

            //Calculate score
            if (numberOfMatches > 0) {
                resumeOverallScore = numberOfMatches / totalPossibleScore;
                //Convert to whole number
                resumeOverallScore = parseInt(resumeOverallScore * 100);
            }

            resumeScore.overallScore.numberGrade = resumeOverallScore;
            resumeScore.overallScore.letterGrade = getLetterGrade(resumeOverallScore);
            resumeScore.overallScore.letterGradeClass = getLetterGradeTextClass(resumeScore.overallScore.letterGrade);
            resumeScore.overallScore.letterGradeExplanation = getLetterGradeExplanation(resumeScore.overallScore.letterGrade);

            return resumeScore;

        };

        //*************************************************************
        //Private Functions
        //*************************************************************
        function getLetterGrade(numberGrade) {

            var letterGrade = "F";

            if (numberGrade >= 90) {
                letterGrade = "A"
                return letterGrade;
            }

            if (numberGrade >= 80) {
                letterGrade = "B"
                return letterGrade;
            }

            if (numberGrade >= 70) {
                letterGrade = "C"
                return letterGrade;
            }

            if (numberGrade >= 60) {
                letterGrade = "D"
                return letterGrade;
            }

            return letterGrade;

        }
        ;

        function getLetterGradeTextClass(letterGrade) {

            var gradeTextClass = "danger";

            if (letterGrade === "A" || letterGrade === "B") {
                gradeTextClass = "success";
            }
            ;

            if (letterGrade === "C" || letterGrade === "D") {
                gradeTextClass = "warning";
            }

            return gradeTextClass;

        }
        ;

        function getLetterGradeExplanation(letterGrade) {

            var letterGradeExplanation = "Your resume does not appear to fit the job posting.";

            if (letterGrade === "A" || letterGrade === "B") {
                letterGradeExplanation = "Your resume seems to fit the job posting well.";
            }
            ;

            if (letterGrade === "C") {
                letterGradeExplanation = "Your resume somewhat fits the job posting.";
            }

            if (letterGrade === "D") {
                letterGradeExplanation = "Your resume just barely fits the job posting.";
            }

            return letterGradeExplanation;

        }
        ;

        /** Function count the occurrences of substring in a string;
         * @param {String} string   Required. The string;
         * @param {String} subString    Required. The string to search for;
         * @param {Boolean} allowOverlapping    Optional. Default: false;
         * @author Vitim.us http://stackoverflow.com/questions/4009756/how-to-count-string-occurrence-in-string/7924240#7924240
         */
        function occurrences(string, subString, allowOverlapping) {

            string += "";
            subString += "";
            if (subString.length <= 0)
                return (string.length + 1);

            var n = 0,
                    pos = 0,
                    step = allowOverlapping ? 1 : subString.length;

            while (true) {
                pos = string.indexOf(subString, pos);
                if (pos >= 0) {
                    ++n;
                    pos += step;
                } else
                    break;
            }

            return n;
        }

        var removePunctuation = function (text) {

            var cleanText = text.replace(/[.,;]/g, function (punctuation) {
                return punctuation + " ";
            });

            return cleanText;

        };

        return ({
            openModal: openModal,
            validateForm: validateForm,
            processText: processText,
            analyzeText: analyzeText,
            getLabels: getLabels,
            getDataPoints: getDataPoints,
            scoreResume: scoreResume

        });

    }]);

app.factory('dataService', ['$http', function ($http) {

        var apiKey = 'ecf98f21a364c1b5c884fb598b35c143d9ab65c7';
        var apiUrl = 'http://gateway-a.watsonplatform.net/calls/text/TextGetRankedKeywords';
        var mailChimpApiUrl = 'http://www.apps.federaljobinsider.com/api/mailChimpIntegration.php?email_address=';
        var postingApiUrl = 'http://apps.federaljobinsider.com/api/getusajobspostingbyid.php?id=';

        var callTextAnalysisApi = function (text) {

            var data = $.param({
                text: text,
                outputMode: 'json',
                maxRetrieve: 30

            });

            return $http.post(apiUrl + "?apikey=" + apiKey, data);

        };

        var callMailChimpApi = function (emailAddress) {

            return $http.get(mailChimpApiUrl + emailAddress);

        };

        var callPostingApi = function (postingControlNumber) {

            return $http.get(postingApiUrl + postingControlNumber);

        };

        return ({
            callTextAnalysisApi: callTextAnalysisApi,
            callMailChimpApi: callMailChimpApi,
            callPostingApi: callPostingApi
        });

    }]);

app.controller('MailController', ['$scope', function ($scope) {

        $scope.emailAddress = "";

        $scope.sendEmail = function () {

        };

    }]);

app.filter('percentage', ['$filter', function ($filter) {
        return function (input, decimals) {
            return $filter('number')(input * 100, decimals) + '%';
        };
    }]);